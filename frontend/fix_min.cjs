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
            
            content = content.replace(/<input[^>]+step="50"[^>]*>/g, (match) => {
                if(match.includes('min="1"')) {
                    modified = true;
                    return match.replace('min="1"', 'min="0"');
                }
                return match;
            });
            
            // Also handle cases where step was added dynamically by my previous script
            content = content.replace(/min="1"\s+step="50"/g, 'min="0" step="50"');
            content = content.replace(/step="50"\s+min="1"/g, 'step="50" min="0"');

            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log('Fixed min in', fullPath);
            }
        }
    });
}

walk(dir);
