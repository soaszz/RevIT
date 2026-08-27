export type AngleMode = "deg" | "rad";

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "leftParen" }
  | { type: "rightParen" };

const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "sqrt", "abs"]);

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(character)) {
      const start = index;
      let dots = 0;
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        if (expression[index] === ".") dots += 1;
        index += 1;
      }
      if (dots > 1) throw new Error("Invalid number");
      if (index < expression.length && /[eE]/.test(expression[index])) {
        const exponentStart = index;
        index += 1;
        if (/[+-]/.test(expression[index] ?? "")) index += 1;
        const exponentDigits = index;
        while (index < expression.length && /[0-9]/.test(expression[index])) index += 1;
        if (exponentDigits === index) index = exponentStart;
      }
      const value = Number(expression.slice(start, index));
      if (!Number.isFinite(value)) throw new Error("Invalid number");
      tokens.push({ type: "number", value });
      continue;
    }

    if (character === "π") {
      tokens.push({ type: "identifier", value: "pi" });
      index += 1;
      continue;
    }

    if (/[A-Za-z]/.test(character)) {
      const start = index;
      while (index < expression.length && /[A-Za-z]/.test(expression[index])) index += 1;
      tokens.push({ type: "identifier", value: expression.slice(start, index).toLowerCase() });
      continue;
    }

    if (character === "(") tokens.push({ type: "leftParen" });
    else if (character === ")") tokens.push({ type: "rightParen" });
    else if ("+-−*×/÷^%!".includes(character)) tokens.push({ type: "operator", value: character });
    else throw new Error(`Unsupported character: ${character}`);
    index += 1;
  }

  return tokens;
}

function factorial(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error("Factorial requires a whole number");
  if (value > 170) throw new Error("Factorial is too large");
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function applyFunction(name: string, value: number, angleMode: AngleMode) {
  const radians = angleMode === "deg" ? value * Math.PI / 180 : value;
  switch (name) {
    case "sin": return Math.sin(radians);
    case "cos": return Math.cos(radians);
    case "tan": return Math.tan(radians);
    case "asin": return angleMode === "deg" ? Math.asin(value) * 180 / Math.PI : Math.asin(value);
    case "acos": return angleMode === "deg" ? Math.acos(value) * 180 / Math.PI : Math.acos(value);
    case "atan": return angleMode === "deg" ? Math.atan(value) * 180 / Math.PI : Math.atan(value);
    case "ln": return Math.log(value);
    case "log": return Math.log10(value);
    case "sqrt": return Math.sqrt(value);
    case "abs": return Math.abs(value);
    default: throw new Error(`Unknown function: ${name}`);
  }
}

export function calculateExpression(expression: string, angleMode: AngleMode = "deg", answer = 0) {
  const tokens = tokenize(expression);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function parsePrimary(): number {
    const token = consume();
    if (!token) throw new Error("Incomplete expression");
    if (token.type === "number") return token.value;
    if (token.type === "leftParen") {
      const value = parseAdditive();
      if (consume()?.type !== "rightParen") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (token.type === "identifier") {
      if (token.value === "pi") return Math.PI;
      if (token.value === "e") return Math.E;
      if (token.value === "ans") return answer;
      if (!FUNCTIONS.has(token.value)) throw new Error(`Unknown function: ${token.value}`);
      if (consume()?.type !== "leftParen") throw new Error(`${token.value} needs parentheses`);
      const value = parseAdditive();
      if (consume()?.type !== "rightParen") throw new Error("Missing closing parenthesis");
      return applyFunction(token.value, value, angleMode);
    }
    throw new Error("Expected a number");
  }

  function parsePostfix(): number {
    let value = parsePrimary();
    while (peek()?.type === "operator" && (peek() as { value: string }).value.match(/^[%!]$/)) {
      const operator = (consume() as { value: string }).value;
      value = operator === "%" ? value / 100 : factorial(value);
    }
    return value;
  }

  function parsePower(): number {
    const base = parsePostfix();
    if (peek()?.type === "operator" && (peek() as { value: string }).value === "^") {
      consume();
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parseUnary(): number {
    const token = peek();
    if (token?.type === "operator" && ["+", "-", "−"].includes(token.value)) {
      consume();
      const value = parseUnary();
      return token.value === "+" ? value : -value;
    }
    return parsePower();
  }

  function parseMultiplicative(): number {
    let value = parseUnary();
    while (peek()?.type === "operator" && ["*", "×", "/", "÷"].includes((peek() as { value: string }).value)) {
      const operator = (consume() as { value: string }).value;
      const right = parseUnary();
      value = operator === "*" || operator === "×" ? value * right : value / right;
    }
    return value;
  }

  function parseAdditive(): number {
    let value = parseMultiplicative();
    while (peek()?.type === "operator" && ["+", "-", "−"].includes((peek() as { value: string }).value)) {
      const operator = (consume() as { value: string }).value;
      const right = parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  if (!tokens.length) throw new Error("Enter a calculation");
  const value = parseAdditive();
  if (cursor !== tokens.length) throw new Error("Check the expression");
  if (!Number.isFinite(value) || Number.isNaN(value)) throw new Error("Result is outside the real-number range");
  return Math.abs(value) < 1e-13 ? 0 : value;
}

export function formatCalculatorResult(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e12 || magnitude < 1e-9)) {
    return value.toExponential(10).replace(/\.0+(?=e)/, "").replace(/(\.\d*?[1-9])0+(?=e)/, "$1");
  }
  return String(Number(value.toPrecision(12)));
}
