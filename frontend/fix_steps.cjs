const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/odero/.gemini/antigravity/scratch/member_system/frontend/src';

function walk(currentDir) {
    fs.readdirSync(currentDir).forEach(f => {
        const fullPath = path.join(currentDir, f);
        if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
        else if (fullPath.endsWith('.jsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            // For simple inline <input type="number" ... />
            content = content.replace(/<input\s+type="number"\s+name="(amount|saccoAmount|personalAmount|budgetedAmount|amountInvested|currentValue|guaranteedAmt)"(.*?)>/gi, (match, name, rest) => {
                if (rest.includes('step=')) return match;
                modified = true;
                return `<input type="number" name="${name}" step="50"${rest}>`;
            });
            
            // For MemberPortal potForm and alloc
            if (fullPath.endsWith('MemberPortal.jsx')) {
                if (!content.includes('step="50"')) {
                    content = content.replace(/potForm\.targetAmount\} onChange/g, 'potForm.targetAmount} step="50" onChange');
                    content = content.replace(/value=\{alloc\.amount\}\n\s+onChange/g, 'value={alloc.amount}\n                                                        step="50"\n                                                        onChange');
                    modified = true;
                }
            }

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed', fullPath);
            }
        }
    });
}

walk(dir);
