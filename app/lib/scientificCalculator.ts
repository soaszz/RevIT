export type AngleMode = "deg" | "rad";

type Token =
  | { type: "number"; value: number; raw: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "leftParen" | "rightParen" | "comma" };

type ExpressionNode =
  | { type: "number"; value: number; raw: string }
  | { type: "constant"; name: "pi" | "e" | "ans" | "slot" | "cursor" }
  | { type: "group"; value: ExpressionNode }
  | { type: "unary"; operator: "+" | "-"; value: ExpressionNode }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^" | "~"; left: ExpressionNode; right: ExpressionNode }
  | { type: "postfix"; operator: "%" | "!"; value: ExpressionNode }
  | { type: "function"; name: string; arguments: ExpressionNode[] };

const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "sqrt", "cbrt", "abs", "frac", "root"]);

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
      const raw = expression.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("Invalid number");
      tokens.push({ type: "number", value, raw });
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
    else if (character === ",") tokens.push({ type: "comma" });
    else if ("+-−*×/÷^%!~".includes(character)) tokens.push({ type: "operator", value: character });
    else throw new Error(`Unsupported character: ${character}`);
    index += 1;
  }

  return tokens;
}

function normalizeOperator(operator: string) {
  if (operator === "−") return "-";
  if (operator === "×") return "*";
  if (operator === "÷") return "/";
  return operator;
}

function parseExpression(expression: string): ExpressionNode {
  const tokens = tokenize(expression);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  function parsePrimary(): ExpressionNode {
    const token = consume();
    if (!token) throw new Error("Incomplete expression");
    if (token.type === "number") return { type: "number", value: token.value, raw: token.raw };
    if (token.type === "leftParen") {
      const value = parseAdditive();
      if (consume()?.type !== "rightParen") throw new Error("Missing closing parenthesis");
      return { type: "group", value };
    }
    if (token.type === "identifier") {
      if (["pi", "e", "ans", "slot", "cursor"].includes(token.value)) return { type: "constant", name: token.value as "pi" | "e" | "ans" | "slot" | "cursor" };
      if (!FUNCTIONS.has(token.value)) throw new Error(`Unknown function: ${token.value}`);
      if (consume()?.type !== "leftParen") throw new Error(`${token.value} needs parentheses`);
      const argumentsList: ExpressionNode[] = [];
      if (peek()?.type !== "rightParen") {
        argumentsList.push(parseAdditive());
        while (peek()?.type === "comma") {
          consume();
          argumentsList.push(parseAdditive());
        }
      }
      if (consume()?.type !== "rightParen") throw new Error("Missing closing parenthesis");
      return { type: "function", name: token.value, arguments: argumentsList };
    }
    throw new Error("Expected a number");
  }

  function parsePostfix(): ExpressionNode {
    let value = parsePrimary();
    while (peek()?.type === "operator" && ["%", "!"].includes((peek() as { value: string }).value)) {
      const operator = (consume() as { value: string }).value as "%" | "!";
      value = { type: "postfix", operator, value };
    }
    return value;
  }

  function parsePower(): ExpressionNode {
    const base = parsePostfix();
    if (peek()?.type === "operator" && (peek() as { value: string }).value === "^") {
      consume();
      return { type: "binary", operator: "^", left: base, right: parseUnary() };
    }
    return base;
  }

  function parseUnary(): ExpressionNode {
    const token = peek();
    if (token?.type === "operator" && ["+", "-", "−"].includes(token.value)) {
      consume();
      return { type: "unary", operator: token.value === "+" ? "+" : "-", value: parseUnary() };
    }
    return parsePower();
  }

  function parseMultiplicative(): ExpressionNode {
    let value = parseUnary();
    while (peek()?.type === "operator" && ["*", "×", "/", "÷", "~"].includes((peek() as { value: string }).value)) {
      const operator = normalizeOperator((consume() as { value: string }).value) as "*" | "/" | "~";
      value = { type: "binary", operator, left: value, right: parseUnary() };
    }
    return value;
  }

  function parseAdditive(): ExpressionNode {
    let value = parseMultiplicative();
    while (peek()?.type === "operator" && ["+", "-", "−"].includes((peek() as { value: string }).value)) {
      const operator = normalizeOperator((consume() as { value: string }).value) as "+" | "-";
      value = { type: "binary", operator, left: value, right: parseMultiplicative() };
    }
    return value;
  }

  if (!tokens.length) throw new Error("Enter a calculation");
  const tree = parseAdditive();
  if (cursor !== tokens.length) throw new Error("Check the expression");
  return tree;
}

function factorial(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new Error("Factorial requires a whole number");
  if (value > 170) throw new Error("Factorial is too large");
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function evaluateFunction(name: string, values: number[], angleMode: AngleMode) {
  const value = values[0];
  const radians = angleMode === "deg" ? value * Math.PI / 180 : value;
  if (name === "frac") {
    if (values.length !== 2) throw new Error("A fraction needs a numerator and denominator");
    return values[0] / values[1];
  }
  if (name === "root") {
    if (values.length !== 2) throw new Error("A root needs a value and an index");
    if (values[0] < 0 && Number.isInteger(values[1]) && Math.abs(values[1] % 2) === 1) return -Math.pow(-values[0], 1 / values[1]);
    return Math.pow(values[0], 1 / values[1]);
  }
  if (values.length !== 1) throw new Error(`${name} accepts one value`);
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
    case "cbrt": return Math.cbrt(value);
    case "abs": return Math.abs(value);
    default: throw new Error(`Unknown function: ${name}`);
  }
}

function evaluateNode(node: ExpressionNode, angleMode: AngleMode, answer: number): number {
  if (node.type === "number") return node.value;
  if (node.type === "constant") {
    if (node.name === "slot" || node.name === "cursor") throw new Error("Incomplete expression");
    return node.name === "pi" ? Math.PI : node.name === "e" ? Math.E : answer;
  }
  if (node.type === "group") return evaluateNode(node.value, angleMode, answer);
  if (node.type === "unary") {
    const value = evaluateNode(node.value, angleMode, answer);
    return node.operator === "+" ? value : -value;
  }
  if (node.type === "postfix") {
    const value = evaluateNode(node.value, angleMode, answer);
    return node.operator === "%" ? value / 100 : factorial(value);
  }
  if (node.type === "function") return evaluateFunction(node.name, node.arguments.map((argument) => evaluateNode(argument, angleMode, answer)), angleMode);
  const left = evaluateNode(node.left, angleMode, answer);
  const right = evaluateNode(node.right, angleMode, answer);
  if (node.operator === "+") return left + right;
  if (node.operator === "-") return left - right;
  if (node.operator === "*") return left * right;
  if (node.operator === "/") return left / right;
  if (node.operator === "~") return left * right;
  return Math.pow(left, right);
}

function nodePrecedence(node: ExpressionNode): number {
  if (node.type !== "binary") return 5;
  if (node.operator === "+" || node.operator === "-") return 1;
  if (node.operator === "*" || node.operator === "/") return 2;
  return 3;
}

function renderLatex(node: ExpressionNode, parentPrecedence = 0): string {
  if (node.type === "number") return node.raw.replace(/e([+-]?\d+)/i, String.raw`\times 10^{$1}`);
  if (node.type === "constant") {
    if (node.name === "slot") return String.raw`\square`;
    if (node.name === "cursor") return String.raw`\htmlClass{calculator-math-caret}{\vert}`;
    return node.name === "pi" ? String.raw`\pi` : node.name === "ans" ? String.raw`\operatorname{Ans}` : "e";
  }
  if (node.type === "group") return String.raw`\left(${renderLatex(node.value)}\right)`;
  if (node.type === "unary") return `${node.operator}${renderLatex(node.value, 4)}`;
  if (node.type === "postfix") return `${renderLatex(node.value, 4)}${node.operator === "%" ? String.raw`\%` : "!"}`;
  if (node.type === "function") {
    const args = node.arguments.map((argument) => renderLatex(argument));
    if (node.name === "frac") return String.raw`\frac{${args[0] ?? String.raw`\square`}}{${args[1] ?? String.raw`\square`}}`;
    if (node.name === "sqrt") return String.raw`\sqrt{${args[0] ?? String.raw`\square`}}`;
    if (node.name === "cbrt") return String.raw`\sqrt[3]{${args[0] ?? String.raw`\square`}}`;
    if (node.name === "root") return String.raw`\sqrt[${args[1] ?? "n"}]{${args[0] ?? String.raw`\square`}}`;
    const inverse = node.name.startsWith("a") && ["asin", "acos", "atan"].includes(node.name);
    const functionName = inverse ? node.name.slice(1) : node.name;
    const command = ["sin", "cos", "tan", "ln", "log"].includes(functionName) ? `\\${functionName}` : `\\operatorname{${functionName}}`;
    return `${command}${inverse ? "^{-1}" : ""}\\left(${args.join(",")}\\right)`;
  }
  if (node.operator === "^") return `{${renderLatex(node.left, 3)}}^{${renderLatex(node.right)}}`;
  const precedence = nodePrecedence(node);
  const operator = node.operator === "*" ? String.raw`\times` : node.operator === "/" ? String.raw`\div` : node.operator === "~" ? "" : node.operator;
  const expression = `${renderLatex(node.left, precedence)} ${operator} ${renderLatex(node.right, precedence + (node.operator === "-" || node.operator === "/" ? 1 : 0))}`;
  return precedence < parentPrecedence ? String.raw`\left(${expression}\right)` : expression;
}

export function closeCalculatorParentheses(expression: string) {
  let balance = 0;
  for (const character of expression) {
    if (character === "(") balance += 1;
    else if (character === ")" && balance > 0) balance -= 1;
  }
  return `${expression}${")".repeat(balance)}`;
}

export function calculateExpression(expression: string, angleMode: AngleMode = "deg", answer = 0) {
  const value = evaluateNode(parseExpression(closeCalculatorParentheses(expression)), angleMode, answer);
  if (!Number.isFinite(value) || Number.isNaN(value)) throw new Error("Result is outside the real-number range");
  return Math.abs(value) < 1e-13 ? 0 : value;
}

function endsDisplayPrimary(character: string | undefined) {
  return Boolean(character && /[0-9A-Za-zπe)!%]/.test(character));
}

function startsDisplayPrimary(character: string | undefined) {
  return Boolean(character && /[0-9A-Za-zπe(]/.test(character));
}

function prepareCalculatorExpressionForDisplay(expression: string, cursorIndex?: number) {
  let displayExpression = expression.trim();
  if (!displayExpression) return cursorIndex === undefined ? "slot" : "0~cursor";

  if (cursorIndex !== undefined) {
    const safeCursor = Math.min(Math.max(0, cursorIndex), displayExpression.length);
    const before = displayExpression[safeCursor - 1];
    const after = displayExpression[safeCursor];
    const cursorToken = `${endsDisplayPrimary(before) ? "~" : ""}cursor${startsDisplayPrimary(after) ? "~" : ""}`;
    displayExpression = `${displayExpression.slice(0, safeCursor)}${cursorToken}${displayExpression.slice(safeCursor)}`;
  }

  // Keep natural templates visible while the learner is still filling them in.
  // The placeholder is only used for rendering and can never be evaluated.
  displayExpression = displayExpression.replace(/,\s*(?=\))/g, ",slot");
  if (/[,+(\-−×*÷/^]$/.test(displayExpression)) displayExpression += "slot";
  return displayExpression;
}

export function calculatorExpressionToLatex(expression: string) {
  return renderLatex(parseExpression(closeCalculatorParentheses(prepareCalculatorExpressionForDisplay(expression))));
}

export function calculatorExpressionWithCursorToLatex(expression: string, cursorIndex: number) {
  return renderLatex(parseExpression(closeCalculatorParentheses(prepareCalculatorExpressionForDisplay(expression, cursorIndex))));
}

export function formatCalculatorResult(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e12 || magnitude < 1e-9)) {
    return value.toExponential(10).replace(/\.0+(?=e)/, "").replace(/(\.\d*?[1-9])0+(?=e)/, "$1");
  }
  return String(Number(value.toPrecision(12)));
}

export function formatCalculatorFraction(value: number) {
  if (!Number.isFinite(value)) return formatCalculatorResult(value);
  const sign = value < 0 ? -1 : 1;
  const target = Math.abs(value);
  if (Number.isInteger(target)) return String(value);
  let lowerNumerator = 0;
  let lowerDenominator = 1;
  let upperNumerator = 1;
  let upperDenominator = 0;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const numerator = lowerNumerator + upperNumerator;
    const denominator = lowerDenominator + upperDenominator;
    if (denominator > 10000) break;
    const approximation = numerator / denominator;
    if (Math.abs(approximation - target) < 1e-10) return `${sign * numerator}/${denominator}`;
    if (approximation < target) {
      lowerNumerator = numerator;
      lowerDenominator = denominator;
    } else {
      upperNumerator = numerator;
      upperDenominator = denominator;
    }
  }
  return formatCalculatorResult(value);
}
