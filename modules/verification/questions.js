// Verification question generators (ported)

function generateMathQuestion() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  return {
    type: 'math',
    question: `Ile to jest ${a} + ${b}?`,
    answer: String(a + b),
    label: `Rozwiąż zadanie: ${a} + ${b} = ?`
  };
}

function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let captcha = '';
  const length = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < length; i++) {
    captcha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return {
    type: 'captcha',
    question: `Przepisz dokładnie ten tekst: **${captcha}**`,
    answer: captcha,
    label: `Przepisz tekst: ${captcha}`
  };
}

function getRandomQuestion() {
  return Math.random() < 0.5 ? generateMathQuestion() : generateCaptcha();
}

module.exports = { generateMathQuestion, generateCaptcha, getRandomQuestion };
