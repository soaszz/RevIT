const fs = require('fs');
let code = fs.readFileSync('app/RevITApp.tsx', 'utf-8');

if (!code.includes('const [confirmConfig')) {
    code = code.replace(
      'const [themeReady, setThemeReady] = useState(false);',
      'const [themeReady, setThemeReady] = useState(false);\n  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, action?: () => void, title?: string, message?: string, confirmLabel?: string}>({ isOpen: false });\n\n  function requestConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {\n    setConfirmConfig({ isOpen: true, title, message, confirmLabel, action: () => {\n      onConfirm();\n      setConfirmConfig({ isOpen: false });\n    }});\n  }'
    );
}

fs.writeFileSync('app/RevITApp.tsx', code);
console.log("Fixed main logic");
