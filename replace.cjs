const fs = require("fs");
const file = "app/components/ReviewSessionPreferences.module.css";
let text = fs.readFileSync(file, "utf8");

const replacement = `.switch {
  position: relative;
  display: block;
  width: 51px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0;
  background: var(--surface-soft);
  color: var(--muted);
  box-shadow: none;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease;
  cursor: pointer;
}

.switch:hover {
  border-color: color-mix(in srgb, var(--green) 45%, var(--line));
}

.switchEnabled {
  border-color: color-mix(in srgb, var(--green) 50%, var(--line));
  background: var(--green-soft);
  color: var(--green-dark);
}

.switchLabel {
  position: absolute;
  top: 9px;
  right: 9px;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: .02em;
  line-height: 1;
}

.switchEnabled .switchLabel {
  right: auto;
  left: 10px;
}

.switchThumb {
  position: absolute;
  top: 4.5px;
  left: 5px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--muted);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .16);
  transition: transform .25s cubic-bezier(0.4, 0, 0.2, 1), background-color .18s ease;
}

.switchEnabled .switchThumb {
  background: var(--green);
  transform: translateX(22px);
}`;

// I will match everything from '.switch {' to '.switchEnabled .switchThumb {\n  background: var(--green);\n}'
const regex = /\.switch \{[\s\S]*?\.switchEnabled \.switchThumb \{[\s\S]*?\}/;
text = text.replace(regex, replacement);
fs.writeFileSync(file, text);
