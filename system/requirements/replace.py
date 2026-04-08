import os
import re

files = [
    r'c:\Users\aliza\system\requirements\index.html',
    r'c:\Users\aliza\system\requirements\eclipso-landing.html',
    r'c:\Users\aliza\system\requirements\eclipso-payment.html',
    r'c:\Users\aliza\system\requirements\eclipso-backend\public\index.html',
    r'c:\Users\aliza\system\requirements\eclipso-backend\public\eclipso-landing.html',
    r'c:\Users\aliza\system\requirements\eclipso-backend\public\eclipso-payment.html',
    r'c:\Users\aliza\system\requirements\eclipso-backend\server.js'
]

for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as f_in:
            content = f_in.read()
        
        # Replace the HTML bolded version first
        content = re.sub(r'ECLI<b>P</b>SO', 'GE<b>O</b>EDC', content)
        # Replace all instances of capitalized ECLIPSO
        content = re.sub(r'ECLIPSO', 'GEOEDC', content)
        content = re.sub(r'Eclipso', 'GEOEDC', content)

        with open(f, 'w', encoding='utf-8') as f_out:
            f_out.write(content)
