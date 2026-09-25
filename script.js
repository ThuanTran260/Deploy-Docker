class Calculator {
  constructor(displayElement, historyElement) {
    this.displayElement = displayElement;
    this.historyElement = historyElement;
    this.clear();
  }

  clear() {
    this.currentOperand = '0';
    this.previousOperand = '';
    this.operation = undefined;
    this.resetNext = false;
    this.updateDisplay();
  }

  delete() {
    if (this.resetNext) {
      this.clear();
      return;
    }
    if (this.currentOperand === '0' || this.currentOperand === 'Error') {
      return;
    }
    if (this.currentOperand.length === 1) {
      this.currentOperand = '0';
    } else {
      this.currentOperand = this.currentOperand.slice(0, -1);
    }
    this.updateDisplay();
  }

  appendNumber(number) {
    if (this.resetNext || this.currentOperand === 'Error') {
      this.currentOperand = '';
      this.resetNext = false;
    }
    if (number === '.' && this.currentOperand.includes('.')) return;
    if (this.currentOperand === '0' && number !== '.') {
      this.currentOperand = number.toString();
    } else {
      this.currentOperand = this.currentOperand.toString() + number.toString();
    }
    this.updateDisplay();
  }

  chooseOperation(operation) {
    if (this.currentOperand === 'Error') return;
    if (this.currentOperand === '') {
      if (this.previousOperand !== '') {
        this.operation = operation;
        this.updateDisplay();
      }
      return;
    }
    if (this.previousOperand !== '') {
      this.compute();
    }
    this.operation = operation;
    this.previousOperand = this.currentOperand;
    this.currentOperand = '';
    this.updateDisplay();
  }

  compute() {
    let computation;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);
    if (isNaN(prev) || isNaN(current)) return;

    switch (this.operation) {
      case '+':
        computation = prev + current;
        break;
      case '−':
      case '-':
        computation = prev - current;
        break;
      case '×':
      case '*':
        computation = prev * current;
        break;
      case '÷':
      case '/':
        if (current === 0) {
          this.currentOperand = 'Error';
          this.previousOperand = '';
          this.operation = undefined;
          this.resetNext = true;
          this.updateDisplay();
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    // Limit decimal precision to avoid float bugs like 0.1 + 0.2 = 0.30000000000000004
    this.currentOperand = Math.round(computation * 1000000000) / 1000000000;
    this.operation = undefined;
    this.previousOperand = '';
    this.resetNext = true;
    this.updateDisplay();
  }

  applyPercent() {
    if (this.currentOperand === 'Error' || this.currentOperand === '') return;
    const current = parseFloat(this.currentOperand);
    if (isNaN(current)) return;
    this.currentOperand = (current / 100).toString();
    this.updateDisplay();
  }

  formatDisplayNumber(number) {
    if (number === 'Error') return 'Error';
    const stringNumber = number.toString();
    const integerDigits = parseFloat(stringNumber.split('.')[0]);
    const decimalDigits = stringNumber.split('.')[1];
    let integerDisplay;
    if (isNaN(integerDigits)) {
      integerDisplay = '';
    } else {
      integerDisplay = integerDigits.toLocaleString('en', {
        maximumFractionDigits: 0
      });
    }
    if (decimalDigits != null) {
      return `${integerDisplay}.${decimalDigits}`;
    } else {
      return integerDisplay;
    }
  }

  updateDisplay() {
    this.displayElement.innerText = this.formatDisplayNumber(this.currentOperand);
    if (this.operation != null) {
      this.historyElement.innerText = `${this.formatDisplayNumber(this.previousOperand)} ${this.operation}`;
    } else {
      this.historyElement.innerText = '';
    }
  }
}

// DOM Setup & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const displayElement = document.getElementById('calcDisplay');
  const historyElement = document.getElementById('calcHistory');
  const calculator = new Calculator(displayElement, historyElement);

  // Number Buttons
  document.querySelectorAll('[data-number]').forEach(button => {
    button.addEventListener('click', () => {
      calculator.appendNumber(button.getAttribute('data-number'));
    });
  });

  // Operator Buttons
  document.querySelectorAll('[data-operator]').forEach(button => {
    button.addEventListener('click', () => {
      calculator.chooseOperation(button.getAttribute('data-operator'));
    });
  });

  // Action Buttons
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-action');
      if (action === 'clear') calculator.clear();
      if (action === 'delete') calculator.delete();
      if (action === 'calculate') calculator.compute();
      if (action === 'percent') calculator.applyPercent();
    });
  });

  // Keyboard Shortcuts Support
  window.addEventListener('keydown', e => {
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
      calculator.appendNumber(e.key);
    } else if (e.key === '+' || e.key === '-') {
      calculator.chooseOperation(e.key === '-' ? '−' : '+');
    } else if (e.key === '*') {
      calculator.chooseOperation('×');
    } else if (e.key === '/') {
      e.preventDefault();
      calculator.chooseOperation('÷');
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      calculator.compute();
    } else if (e.key === 'Backspace') {
      calculator.delete();
    } else if (e.key === 'Escape') {
      calculator.clear();
    } else if (e.key === '%') {
      calculator.applyPercent();
    }
  });
});
