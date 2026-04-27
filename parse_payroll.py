import os
import json
from datetime import datetime

def parse_payroll_data(filepath='SPRINT_PLANNING_files/PayrollData.txt', output_path='data.json'):
    # Initialize the structure exactly how the JS and Python backend expect it
    database = {
        "employees": {}
    }
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return False
        
    # Split by exactly 'Payslip '
    payslip_sections = content.split('Payslip ')
    
    for section in payslip_sections:
        if not section.strip():
            continue
            
        current_emp_id = None
        current_data = {
            "name": "",
            "role": "",
            "taxCode": "",
            "payslips": {}
        }
        current_payslip_key = "Unknown"
        current_payslip_data = {
            "earnings": {},
            "deductions": {},
            "gross": 0.0,
            "tax": 0.0,
            "ni": 0.0,
            "net": 0.0
        }
        
        # Extract Name and Role from the first line
        lines = [line.strip() for line in section.strip().split('\n') if line.strip()]
        if lines:
            header = lines[0]
            # Remove the "1: " prefix
            if ':' in header:
                header = header.split(':', 1)[1].strip()
            
            # Now header is "Jane Doe (Senior Software Engineer)"
            if '(' in header and header.endswith(')'):
                name_part, role_part = header.rsplit('(', 1)
                current_data["name"] = name_part.strip()
                current_data["role"] = role_part.replace(')', '').strip()
            else:
                current_data["name"] = header
                
            lines = lines[1:] # remove header
        
        current_section = 'details' # Default to details so it handles missing headers
        for line in lines:
            if line.startswith('Employee Details:'):
                current_section = 'details'
                continue
            elif line.startswith('Earnings:'):
                current_section = 'earnings'
                continue
            elif line.startswith('Deductions:'):
                current_section = 'deductions'
                continue
            elif line.startswith('Net Pay:'):
                current_section = 'net'
                continue
            
            # Clean bullet points
            line = line.replace('•', '').strip()
            
            if not line:
                continue
                
            if current_section == 'details':
                if 'Employee ID:' in line:
                    current_emp_id = line.split('Employee ID:')[1].strip()
                elif 'Tax Code:' in line:
                    current_data["taxCode"] = line.split('Tax Code:')[1].strip()
                elif 'Pay Date:' in line:
                    date_str = line.split('Pay Date:')[1].strip()
                    try:
                        # Extract "July2025" from "31/07/2025"
                        date_obj = datetime.strptime(date_str, "%d/%m/%Y")
                        current_payslip_key = date_obj.strftime("%B%Y")
                    except ValueError:
                        current_payslip_key = date_str.replace('/', '')
                    
            elif current_section == 'earnings':
                if ':' in line:
                    key, val = line.split(':', 1)
                    val = val.replace('£', '').replace(',', '').strip()
                    try:
                        num_val = float(val)
                        current_payslip_data["earnings"][key.strip()] = num_val
                        # Store specific gross if exists
                        if 'Gross Salary' in key or 'Gross Pay' in key:
                            current_payslip_data["gross"] = num_val
                    except ValueError:
                        current_payslip_data["earnings"][key.strip()] = val
                        
            elif current_section == 'deductions':
                if ':' in line:
                    key, val = line.split(':', 1)
                    val = val.replace('£', '').replace(',', '').strip()
                    try:
                        num_val = float(val)
                        current_payslip_data["deductions"][key.strip()] = num_val
                        # Store specific tax/ni values
                        if 'PAYE Tax' in key:
                            current_payslip_data["tax"] = num_val
                        elif 'National Insurance' in key:
                            current_payslip_data["ni"] = num_val
                    except ValueError:
                        current_payslip_data["deductions"][key.strip()] = val
                        
            elif current_section == 'net':
                if 'Net Pay:' in line:
                    val = line.split('Net Pay:')[1].replace('£', '').replace(',', '').strip()
                    try:
                        current_payslip_data["net"] = float(val)
                    except ValueError:
                        pass
                        
        if current_emp_id:
            # Group into the same employee object if they already exist
            if current_emp_id in database["employees"]:
                database["employees"][current_emp_id]["payslips"][current_payslip_key] = current_payslip_data
            else:
                current_data["payslips"][current_payslip_key] = current_payslip_data
                database["employees"][current_emp_id] = current_data
            
    # Write to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(database, f, indent=2)
        
    print(f"Successfully scraped {len(database['employees'])} employees into {output_path}")
    return True

if __name__ == "__main__":
    parse_payroll_data()
