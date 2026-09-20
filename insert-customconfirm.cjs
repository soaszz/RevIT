const fs = require('fs');
const lines = fs.readFileSync('app/RevITApp.tsx', 'utf-8').split('\n');

const customConfirmJsx = `      <CustomConfirm
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title ?? ""}
        message={confirmConfig.message ?? ""}
        confirmLabel={confirmConfig.confirmLabel}
        onConfirm={confirmConfig.action ?? (() => {})}
        onCancel={() => setConfirmConfig({ isOpen: false })}
      />
    </main>`;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('</main>')) {
    lines[i] = lines[i].replace('</main>', customConfirmJsx);
    break;
  }
}

fs.writeFileSync('app/RevITApp.tsx', lines.join('\n'));
