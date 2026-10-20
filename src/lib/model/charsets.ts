export type AsciiRenderMode =
  /** Each cell picks one character from a density ramp. */
  | 'ramp'
  /** CP437 half blocks (▀▄█): two vertical sub-pixels per cell. */
  | 'halfBlocks'
  /** Unicode Braille: 2×4 sub-pixels per cell. */
  | 'braille';

export interface AsciiPreset {
  id: string;
  name: string;
  characters: string;
  mode: AsciiRenderMode;
}

const p = (id: string, name: string, characters: string, mode: AsciiRenderMode = 'ramp'): AsciiPreset =>
  ({ id, name, characters, mode });

/** Character set presets. Most are drawn from IBM code page 437 ("extended ASCII"),
 *  written as their Unicode equivalents so any monospaced font can render them. */
export const ASCII_PRESETS: AsciiPreset[] = [
  p('standard', 'Standard', ' .:-=+*#%@'),
  p('detailed', 'Detailed (70 chars)', " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"),
  p('shades', 'CP437 Shades ░▒▓', ' ░▒▓█'),
  p('shadesDots', 'CP437 Dots & Shades', ' ·∙•○◘░▒▓█'),
  p('halfBlocks', 'CP437 Half Blocks ▀▄', ' ▀▄█', 'halfBlocks'),
  p('blocks', 'CP437 Blocks ▌▐▀▄', ' ▪▄▀▌▐■▓█'),
  p('boxSingle', 'CP437 Box Drawing ┼', ' ─│┌┐└┘├┤┬┴┼'),
  p('boxDouble', 'CP437 Double Box ╬', ' ·─═│║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬'),
  p('symbols', 'CP437 Symbols ☺♥♦', ' ·•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼☺☻♥♦♣♠'),
  p('math', 'CP437 Greek & Math', ' ·°ⁿ²¬±÷≈√∩≡ΣπσµτΦΘΩδ∞φεαßΓ'),
  p('accents', 'CP437 Accented Latin', ' ·ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥ƒáíóúñÑªº¿'),
  p('stipple', 'Stipple', ' .·:∙•°*'),
  p('binary', 'Binary 01', ' 01'),
  p('hex', 'Hex dump', ' 0123456789ABCDEF'),
  p('braille', 'Braille dots ⣿', '', 'braille'),
  p('custom', 'Custom…', ''),
];

export const CUSTOM_PRESET_ID = 'custom';

export const asciiPreset = (id: string): AsciiPreset => ASCII_PRESETS.find((x) => x.id === id) ?? ASCII_PRESETS[0];
