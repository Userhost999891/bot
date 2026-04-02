// Unicode Small Caps converter
// Converts regular text to ꜱᴍᴀʟʟ ᴄᴀᴘꜱ for premium Discord aesthetics

const SMALL_CAPS_MAP = {
  'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ',
  'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ',
  'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ',
  'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 'ꜱ', 't': 'ᴛ',
  'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ',
  'z': 'ᴢ',
  'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ',
  'F': 'ꜰ', 'G': 'ɢ', 'H': 'ʜ', 'I': 'ɪ', 'J': 'ᴊ',
  'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ',
  'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ', 'S': 'ꜱ', 'T': 'ᴛ',
  'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ',
  'Z': 'ᴢ'
};

// Polish special characters — keep as-is or map closest
const POLISH_MAP = {
  'ą': 'ą', 'ć': 'ć', 'ę': 'ę', 'ł': 'ł', 'ń': 'ń',
  'ó': 'ó', 'ś': 'ś', 'ź': 'ź', 'ż': 'ż',
  'Ą': 'ą', 'Ć': 'ć', 'Ę': 'ę', 'Ł': 'ł', 'Ń': 'ń',
  'Ó': 'ó', 'Ś': 'ś', 'Ź': 'ź', 'Ż': 'ż'
};

/**
 * Convert text to Small Caps Unicode
 * Preserves emoji, numbers, special characters, and markdown
 * @param {string} text 
 * @returns {string}
 */
function toSmallCaps(text) {
  if (!text) return text;
  
  let result = '';
  let inMarkdown = false;
  let markdownChar = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Skip markdown formatting characters (**, *, __, `)
    if (char === '*' || char === '_' || char === '`' || char === '~') {
      result += char;
      continue;
    }
    
    // Check maps
    if (SMALL_CAPS_MAP[char]) {
      result += SMALL_CAPS_MAP[char];
    } else if (POLISH_MAP[char]) {
      result += POLISH_MAP[char];
    } else {
      result += char;
    }
  }
  
  return result;
}

/**
 * Convert only the label portion to small caps (keeps emoji intact)
 * @param {string} emoji 
 * @param {string} text 
 * @returns {string}
 */
function scLabel(emoji, text) {
  return `${emoji} ${toSmallCaps(text)}`;
}

module.exports = { toSmallCaps, scLabel };
