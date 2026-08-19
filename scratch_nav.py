import os
import glob

frontend_dir = r"C:\Users\SHIHAAM\OneDrive\Desktop\salonautopart2\frontend"
files = glob.glob(os.path.join(frontend_dir, "*.html"))

inventory_link = """
                <a href="inventory.html">
                    <span class="nav-icon">??</span>
                    <span>Inventory</span>
                </a>
"""

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Look for the staff.html link to insert before it
    # Because sometimes Services link has an 'active' class etc.
    staff_link_start = '<a href="staff.html"'
    
    if staff_link_start in content and "inventory.html" not in content:
        # insert before staff_link_start
        parts = content.split(staff_link_start, 1)
        new_content = parts[0] + inventory_link.strip() + "\n                " + staff_link_start + parts[1]
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")

print("Done.")
