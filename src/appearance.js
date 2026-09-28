export const APPEARANCE_KEY = 'gatherhall-appearance-v1';
export const PALETTES = [
  { id: 'periwinkle', name: 'Periwinkle', description: 'Calm, thoughtful & familiar', primary: '#5c5c99', accent: '#ccccff' },
  { id: 'emerald', name: 'Emerald', description: 'Fresh, natural & welcoming', primary: '#176b53', accent: '#bfe8d6' },
  { id: 'ocean', name: 'Ocean blue', description: 'Clear, confident & focused', primary: '#245eaf', accent: '#c7ddff' },
];
export const DEFAULT_APPEARANCE = { palette: 'periwinkle', mode: 'light', custom: { primary: '#5c5c99', accent: '#ccccff' } };
export const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function normalizeAppearance(value) {
  return {
    palette: [...PALETTES.map(p=>p.id),'custom'].includes(value?.palette) ? value.palette : DEFAULT_APPEARANCE.palette,
    mode: ['light','dark','system'].includes(value?.mode) ? value.mode : DEFAULT_APPEARANCE.mode,
    custom: {
      primary: isHex(value?.custom?.primary) ? value.custom.primary.toLowerCase() : DEFAULT_APPEARANCE.custom.primary,
      accent: isHex(value?.custom?.accent) ? value.custom.accent.toLowerCase() : DEFAULT_APPEARANCE.custom.accent,
    },
  };
}
export function readAppearance() {
  try { return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY))); }
  catch { return normalizeAppearance(null); }
}
const rgb = color => [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
export function mix(color, background, weight) {
  const foreground=rgb(color),base=rgb(background);
  return '#'+base.map((channel,i)=>Math.round(channel+(foreground[i]-channel)*weight).toString(16).padStart(2,'0')).join('');
}
const luminance=color=>rgb(color).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
export const contrastRatio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
function readable(color,surfaces,dark) {
  const target=dark?'#ffffff':'#000000';
  for(let i=0;i<=100;i++){const candidate=mix(target,color,i/100);if(surfaces.every(surface=>contrastRatio(candidate,surface)>=4.5))return candidate;}
  return target;
}
export function appearanceTokens(raw, systemDark=false) {
  const value=normalizeAppearance(raw);
  const mode=value.mode==='system'?(systemDark?'dark':'light'):value.mode;
  const dark=mode==='dark';
  const colors=value.palette==='custom'?value.custom:PALETTES.find(p=>p.id===value.palette);
  const canvas=dark?'#101318':'#f6f7fb',surface=dark?'#1a1e26':'#ffffff',elevated=dark?'#222834':'#ffffff';
  const secondary=dark?'#b6bfce':'#535b68';
  const tint=weight=>{for(let i=0;i<=100;i++){const candidate=mix(colors.accent,surface,weight*(1-i/100));if(contrastRatio(secondary,candidate)>=4.5)return candidate;}return surface;};
  const subtle=tint(dark?.10:.20);
  const selected=tint(dark?.20:.46);
  // The selected surface is the most demanding accent/text pairing.
  const primary=readable(colors.primary,[selected,subtle,surface,canvas,elevated,dark?'#242b37':'#f8f9fc'],dark);
  const primaryInk=contrastRatio(primary,'#ffffff')>=contrastRatio(primary,'#000000')?'#ffffff':'#000000';
  const border=dark?'#343c4b':'#dedfe8';
  return { mode, tokens: {
    '--canvas':canvas,'--surface':surface,'--elevated':elevated,'--ink':dark?'#f2f4f8':'#15171c',
    '--text-secondary':dark?'#b6bfce':'#535b68','--text-muted':dark?'#a5afc0':'#656e7c',
    '--field-border':dark?'#8795aa':'#7c8597','--border':border,'--subtle':subtle,'--selected':selected,'--primary':primary,'--primary-ink':primaryInk,
    '--primary-hover':mix(dark?'#ffffff':'#000000',primary,.10),'--accent-source':colors.accent,
    '--lavender':colors.accent,'--lavender-muted':mix(colors.primary,colors.accent,.35),'--hero-bg':subtle,
    '--green':primary,'--dark':dark?'#f2f4f8':'#15171c','--muted':dark?'#b6bfce':'#535b68',
    '--field-bg':dark?'#151a22':'#ffffff','--button-bg':dark?'#242b37':'#ffffff',
    '--table-head':dark?'#202631':'#f8f9fc','--row-hover':dark?'#242b37':'#fafaff',
    '--success-bg':dark?'#153b2e':'#edf7f0','--success-ink':dark?'#96ddba':'#256744',
    '--warning-bg':dark?'#3a301b':'#fff6e3','--warning-ink':dark?'#f1ce82':'#805719',
    '--danger-bg':dark?'#40262b':'#fff0ed','--danger-ink':dark?'#f2b0b8':'#994636',
    '--overlay':dark?'#03060dcc':'#18203866','--shadow':dark?'#00000033':'#20254509',
    '--focus':primary,'--photo-overlay':dark?'#07101870':'#29296622',
  }};
}
export function applyAppearance(value,systemDark=false) {
  const result=appearanceTokens(value,systemDark);
  const root=document.documentElement;
  root.dataset.theme=result.mode;root.dataset.palette=normalizeAppearance(value).palette;
  root.style.colorScheme=result.mode;
  for(const [name,color] of Object.entries(result.tokens))root.style.setProperty(name,color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',result.tokens['--canvas']);
}
export function initializeAppearance(){applyAppearance(readAppearance(),window.matchMedia('(prefers-color-scheme: dark)').matches);}
