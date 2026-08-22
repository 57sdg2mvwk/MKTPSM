const fs = require('fs');
let code = fs.readFileSync('artifacts/amd-marketing-panel/src/App.tsx', 'utf-8');

// Replace text sizes
code = code
  .replace(/\btext-sm\b/g, 'text-[11px]')
  .replace(/\btext-xs\b/g, 'text-[10px]')
  .replace(/\btext-\[11px\]\b/g, 'text-[10px]')
  .replace(/\btext-\[10px\]\b/g, 'text-[9px]')
  .replace(/\btext-lg\b/g, 'text-[13px]')
  .replace(/\btext-xl\b/g, 'text-[14px]')
  .replace(/\btext-2xl\b/g, 'text-[16px]')
  .replace(/\btext-3xl\b/g, 'text-[18px]')
  .replace(/\btext-4xl\b/g, 'text-[20px]');

// Ensure uppercase on text nodes implicitly or add uppercase classes. 
// We will just append uppercase to global classes and specific classes.
code = code.replace(/className="([^"]+)"/g, (match, classes) => {
  let newClasses = classes;
  if (!newClasses.includes('uppercase')) {
    newClasses += ' uppercase';
  }
  // Make everything bold where medium or semibold was
  newClasses = newClasses.replace(/\bfont-medium\b/g, 'font-bold');
  newClasses = newClasses.replace(/\bfont-semibold\b/g, 'font-bold');
  
  // Compact sections: reduce padding/margin
  newClasses = newClasses.replace(/\bp-5\b/g, 'p-3');
  newClasses = newClasses.replace(/\bp-6\b/g, 'p-4');
  newClasses = newClasses.replace(/\bp-8\b/g, 'p-4');
  newClasses = newClasses.replace(/\bp-10\b/g, 'p-6');
  newClasses = newClasses.replace(/\bp-12\b/g, 'p-6');
  newClasses = newClasses.replace(/\bpx-5\b/g, 'px-3');
  newClasses = newClasses.replace(/\bpx-8\b/g, 'px-4');
  newClasses = newClasses.replace(/\bpy-4\b/g, 'py-2');
  newClasses = newClasses.replace(/\bpy-5\b/g, 'py-3');
  newClasses = newClasses.replace(/\bmb-6\b/g, 'mb-3');
  newClasses = newClasses.replace(/\bmb-5\b/g, 'mb-3');
  newClasses = newClasses.replace(/\bmb-4\b/g, 'mb-2');
  newClasses = newClasses.replace(/\bmt-5\b/g, 'mt-3');
  newClasses = newClasses.replace(/\bmt-6\b/g, 'mt-3');
  newClasses = newClasses.replace(/\bgap-5\b/g, 'gap-3');
  newClasses = newClasses.replace(/\bgap-4\b/g, 'gap-2');
  newClasses = newClasses.replace(/\bmin-h-\[56px\]\b/g, 'min-h-[48px]');

  return `className="${newClasses}"`;
});

// Remove accents from all texts
const accents = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'ñ': 'n', 'Ñ': 'N',
};
for (const [accent, plain] of Object.entries(accents)) {
  code = code.split(accent).join(plain);
}

fs.writeFileSync('artifacts/amd-marketing-panel/src/App.tsx', code);
