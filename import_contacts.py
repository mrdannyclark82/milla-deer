import json
import subprocess

def import_contacts():
    print("[*] Requesting Android Contacts...")
    try:
        # Run termux-contact-list
        result = subprocess.run(['termux-contact-list'], capture_output=True, text=True)
        raw_contacts = json.loads(result.stdout)
        
        sarii_contacts = {}
        count = 0
        
        for c in raw_contacts:
            name = c.get('name', 'Unknown').lower()
            number = c.get('number', '')
            
            # clean up number
            if number:
                # Basic normalization
                sarii_contacts[name] = number
                count += 1
                
        # Save to SARIi's format
        with open('contacts.json', 'w') as f:
            json.dump(sarii_contacts, f, indent=2)
            
        print(f"[+] Success! Imported {count} contacts into contacts.json")
        
    except Exception as e:
        print(f"[-] Error: {e}")
        print("Make sure you have granted Contacts permission to Termux (check Settings).")

if __name__ == "__main__":
    import_contacts()
