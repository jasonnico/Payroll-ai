import os
import json
import requests as http_requests
from base64 import b64encode
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Loading environment variables from the .env file
load_dotenv()

# Initialize the Flask Web App to serve static files (frontend) from the current directory
app = Flask(__name__, static_folder='.', static_url_path='')
# Enable CORS so our frontend Javascript can talk to this local server
CORS(app)

@app.route('/')
def serve_frontend():
    return app.send_static_file('index.html')

# Load the dummy database json file into memory
try:
    with open('data.json', 'r', encoding='utf-8') as f:
        database = json.load(f)
except FileNotFoundError:
    database = {"employees": {}}
    print("data.json not found")

# Initialisation of API key, shared through the group
api_key = os.getenv("GEMINI_API_KEY")

if api_key and api_key != "dummy_key":
    # Initialize the new official google-genai client
    try:
        ai_client = genai.Client(api_key=api_key)
        print("Gemini successfully initialized.")
    except Exception as e:
        ai_client = None
        print(f"Failed to initialize Gemini: {e}")
else:
    ai_client = None
    print("API Key not found")

# Jira Configuration (for external ticket creation)
JIRA_DOMAIN = os.getenv("JIRA_DOMAIN")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_KEY = os.getenv("JIRA_API_KEY")
JIRA_PROJECT_KEY = os.getenv("JIRA_PROJECT_KEY", "KAN")


@app.route('/api/login/<id>', methods=['GET'])
def login(id):
    query_id = id.upper()
    employees = database.get("employees", {})
    
    # Strictly require 4 characters for security/compliance
    if len(query_id) != 4:
        return jsonify({"error": "Please enter exactly the last 4 characters of your ID (e.g. U001)"}), 400
    
    # Check if what the user typed matches the end of any ID
    found_id = next((eid for eid in employees if eid.endswith(query_id)), None)
    
    if not found_id:
        return jsonify({"error": "User not found"}), 404
        
    emp_id = found_id

    emp = employees[emp_id]
    return jsonify({
        "user": {
            "name": emp["name"],
            "role": emp.get("role", "Employee"),
            "initials": "".join([n[0] for n in emp["name"].split()])
        },
        "payroll": {
            "employeeNumber": emp_id,
            "taxCode": emp.get("tax_code", "1257L"),
            "niCategory": emp.get("ni_category", "A"),
            "leave": emp.get("leave", {})
        }
    })

# Checks if the Gemini model has been initialised
@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint to confirm the server is running."""
    return jsonify({
        "status": "healthy",
        "service": "MHR PayrollAI Backend",
        "ai_status": "connected" if ai_client else "disconnected"
    })

@app.route('/api/chat', methods=['POST'])
def chat():
    """Endpoint for the frontend to send conversational queries directly to the AI."""
    if not ai_client:
        return jsonify({"error": "API KEY NOT FOUND, Add to the .env file"}), 500
        
    data = request.json or {}
    user_message = data.get("message")
    emp_id = data.get("employeeNumber")
    
    if not user_message:
        return jsonify({"error": "No message provided."}), 400
        
    # Retrieve the user's secure payroll data
    emp_data = database.get("employees", {}).get(emp_id, "No data available")
    
    prompt = f"""
    You are an MHR Payroll Assistant answering a question for an employee. 
    Be polite, concise, and helpful. Use markdown for formatting.
    
    Here is the employee's secure backend payroll data:
    {json.dumps(emp_data, indent=2)}

    RULES:
    1. TAX CODES: If the user is asking what a tax code means, use your general knowledge of the UK tax system to explain it in simple terms.
    2. TAX THRESHOLDS: If the user asks about tax thresholds, bands or another question seeking information about tax codes, ALWAYS use your Google Search tool to find the most up-to-date real numbers, explain them, and then provide this link for more info: https://www.gov.uk/tax-codes.
    3. TAX DISPUTES / ESCALATION: If the user is getting frustrated or is disputing their tax code, tell them you can raise a ticket for them and you MUST include this exact phrase [ESCALATE_TICKET] at the very end of your response.
    4. MULTI-MONTH PAYSLIPS: The employee may have payslips for multiple months. If they ask for "my payslip" without specifying a month, default to the most recent one. If they ask to compare months or see historical data, show both side by side.
    5. PERSONAL DETAILS: If the user asks to update their personal details (e.g. home address, phone number, name change), tell them these changes must be made through the secure self-service portal and provide this link: [People First Portal](https://peoplefirst.mhr.co.uk/).
    6. BANK DETAILS: If the user asks to update bank details, redirect them to the secure portal: [People First Portal](https://peoplefirst.mhr.co.uk/). Never attempt to handle financial changes directly.
    
    The user is asking: "{user_message}"
    """
    
    try:
        # Send the augmented prompt to Google Gemini with Google Search enabled
        # Since the model's knowledge cuts off at early 2025, it can't answer questions about modern-day tax thresholds or bands.
        # It might even end up hallucinating, so we need to enable it to use Online Search to get the latest information
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[{'google_search': {}}]
            )
        )
        return jsonify({"response": response.text})
    except Exception as e:
        print(f"Gemini API Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/ticket', methods=['POST'])
def create_ticket():
    """Create a Jira ticket for HR escalation via the Atlassian REST API."""
    # Check Jira credentials are configured
    if not all([JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_KEY]):
        return jsonify({"error": "Jira is not configured. Add JIRA_DOMAIN, JIRA_EMAIL, and JIRA_API_KEY to .env"}), 500

    data = request.json or {}
    emp_id = data.get("employeeNumber", "UNKNOWN")
    issue_summary = data.get("summary", "HR Escalation from PayrollAI")
    issue_description = data.get("description", "An employee has requested to speak with HR via the PayrollAI chatbot.")

    # Build the Jira API request
    url = f"https://{JIRA_DOMAIN}/rest/api/3/issue"
    auth_string = b64encode(f"{JIRA_EMAIL}:{JIRA_API_KEY}".encode()).decode()

    headers = {
        "Authorization": f"Basic {auth_string}",
        "Content-Type": "application/json"
    }

    payload = {
        "fields": {
            "project": {"key": JIRA_PROJECT_KEY},
            "summary": f"[{emp_id}] {issue_summary}",
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": issue_description}]
                }]
            },
            "issuetype": {"name": "Task"}
        }
    }

    try:
        response = http_requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 201:
            ticket_data = response.json()
            ticket_key = ticket_data.get("key", "UNKNOWN")
            return jsonify({
                "success": True,
                "ticketKey": ticket_key,
                "ticketUrl": f"https://{JIRA_DOMAIN}/browse/{ticket_key}"
            })
        else:
            print(f"Jira API Error: {response.status_code} - {response.text}")
            return jsonify({"error": f"Jira returned status {response.status_code}"}), 502
    except Exception as e:
        print(f"Jira connection error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/history', methods=['POST'])
def save_history():
    """Save chat sessions to a physical text file for persistence beyond the browser."""
    data = request.json or {}
    emp_id = data.get("employeeNumber", "UNKNOWN")
    sessions = data.get("sessions", [])

    if not sessions:
        return jsonify({"status": "nothing to save"}), 200

    # Create the chat_logs directory if it doesn't exist
    logs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chat_logs')
    os.makedirs(logs_dir, exist_ok=True)

    filepath = os.path.join(logs_dir, f"{emp_id}_chat_history.txt")

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"{'='*60}\n")
            f.write(f"  MHR PayrollAI — Chat History for {emp_id}\n")
            f.write(f"{'='*60}\n\n")

            for session in sessions:
                f.write(f"--- {session.get('title', 'Untitled Chat')} ---\n")
                for msg in session.get('messages', []):
                    timestamp = msg.get('time', '')
                    if msg.get('type') == 'user':
                        f.write(f"  [{timestamp}] Employee: {msg.get('text', '')}\n")
                    elif msg.get('type') == 'bot':
                        resp = msg.get('resp', {})
                        f.write(f"  [{timestamp}] PayrollAI: {resp.get('text', '')}\n")
                f.write("\n")

        return jsonify({"status": "saved", "file": filepath})
    except Exception as e:
        print(f"Error saving chat history: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Start the server on port 5000 when the script is run directly
    print("Starting MHR PayrollAI Server on http://localhost:5000")
    app.run(port=5000, debug=True)
