/* ============================================================
   Zachdle — word lists.
   ----------------------------------------------------------
   ZD_ANSWERS: curated pool of common 5-letter English words the
   game will pick from when choosing a secret. Kept small and
   well-known so the daily / seeded word always feels guessable.

   ZD_ALLOWED: a superset used for guess validation. Anything in
   this list is an accepted guess even if it's not a possible
   answer. Same words; extend over time to be more lenient (Wordle
   itself uses a ~12k-word allowed list).

   To swap in the real Wordle lists, replace this file's contents
   with arrays in the same shape — game code reads only the two
   `window.ZD_*` globals.
   ============================================================ */

window.ZD_ANSWERS = [
  "about","above","abuse","actor","acute","admit","adopt","adult","after","again",
  "agent","agree","ahead","alarm","album","alert","alike","alive","allow","alone",
  "along","alter","among","anger","angle","angry","apart","apple","apply","arena",
  "argue","arise","array","aside","asset","audio","audit","avoid","award","aware",
  "baker","basic","basin","beach","began","begin","being","below","bench","berry",
  "bible","billy","birth","black","blame","blank","blast","blend","blind","block",
  "blond","blood","bloom","blown","board","boast","boost","booth","bound","brain",
  "brake","brand","brass","brave","bread","break","breed","brick","brief","bring",
  "broad","broke","brook","brown","brush","build","built","bunch","burst","cable",
  "cabin","cache","candy","carry","catch","cause","chain","chair","chalk","champ",
  "chant","chaos","cheap","cheat","check","chest","chief","child","chill","chose",
  "civil","claim","clamp","class","clean","clear","click","cliff","climb","clock",
  "close","cloth","cloud","coach","coast","color","could","count","court","cover",
  "craft","crane","crash","crazy","cream","creep","crept","crime","cross","crowd",
  "crown","crude","crust","curve","cycle","daily","dance","dated","dealt","death",
  "debut","delay","depth","diary","dirty","ditch","dough","doubt","draft","drain",
  "drama","drawn","dream","dress","dried","drill","drink","drive","drove","dying",
  "eagle","early","earth","eight","elbow","elder","elite","empty","ended","enemy",
  "enjoy","enter","entry","equal","error","essay","event","every","exact","exist",
  "extra","fable","faded","faint","fairy","faith","false","fancy","fault","favor",
  "fence","ferry","fetch","fever","fewer","fiber","field","fifth","fifty","fight",
  "final","first","fixed","flame","flank","flash","fleet","flesh","flick","float",
  "flock","flood","floor","flora","flour","fluid","flush","focus","force","forge",
  "forth","forty","forum","found","frame","frank","fraud","fresh","fried","front",
  "frost","fruit","fully","funny","gable","gauge","ghost","giant","given","glade",
  "glare","glass","gleam","globe","gloom","glory","gloss","glove","going","golden",
  "grace","grade","grain","grand","grant","grape","graph","grass","grave","great",
  "greed","green","greet","grief","grill","groin","gross","group","grove","grown",
  "guard","guess","guest","guide","guild","habit","handy","happy","harsh","haste",
  "haunt","haven","heart","heavy","hello","hence","heron","honey","horse","hotel",
  "house","human","humor","ideal","image","index","inner","input","irony","issue",
  "ivory","jelly","jewel","joint","judge","juice","kayak","knife","knock","known",
  "label","labor","laden","lance","large","laser","later","laugh","layer","learn",
  "lease","least","leave","ledge","legal","level","light","limit","links","lives",
  "loaded","lobby","local","lodge","logic","loose","lover","lower","lucky","lunch",
  "lying","magic","major","maker","manor","march","marsh","match","maybe","mayor",
  "media","mercy","merry","metal","might","minor","minus","mixed","model","money",
  "month","moral","motor","mount","mouse","mouth","movie","music","naked","never",
  "newly","night","noise","north","noted","novel","nurse","oasis","ocean","offer",
  "often","olive","onion","opera","order","other","ought","ounce","paint","panel",
  "panic","paper","party","peace","peach","perch","pearl","penny","phase","phone",
  "photo","piano","piece","pilot","pipe","pitch","pixel","plain","plane","plank",
  "plant","plate","plaza","point","pouch","pound","power","press","price","pride",
  "prime","print","prior","prize","probe","proof","proud","prove","pulse","queen",
  "quest","quick","quiet","quite","quote","radio","raise","range","rapid","ratio",
  "reach","ready","realm","refer","reign","relax","relay","remix","repay","reply",
  "right","rigid","rival","river","robin","robot","rocky","roger","roman","rough",
  "round","route","royal","rugby","ruler","rural","sable","saint","salad","salon",
  "salty","sandy","scale","scant","scare","scene","scope","score","scorn","scout",
  "scrap","scrub","seize","sense","serve","seven","shade","shake","shall","shape",
  "share","sharp","sheen","sheep","sheet","shelf","shell","shift","shine","shirt",
  "shock","shoot","short","shown","shrub","sight","silky","silly","since","sixth",
  "sized","skate","skill","skirt","skull","slate","sleek","sleep","sleet","slept",
  "slice","slide","slime","slope","slush","small","smart","smash","smile","smith",
  "smoke","snack","snail","snake","sneak","snipe","snore","snowy","solid","solve",
  "sorry","sound","south","space","spare","spark","speak","speed","spell","spend",
  "spent","spice","spicy","spike","spill","spine","split","spoke","spoon","sport",
  "spray","spree","spurt","squad","squat","staff","stage","stair","stake","stamp",
  "stand","stark","start","state","steak","steam","steel","steep","stern","stick",
  "still","sting","stink","stock","stole","stone","stood","stool","store","storm",
  "story","stove","strap","straw","strip","stuck","study","stuff","style","sugar",
  "suite","sunny","super","surge","swamp","swarm","sweat","sweep","sweet","swept",
  "swift","swing","swirl","sword","table","tackl","taken","tales","taste","teach",
  "teeth","tempo","tenor","terra","thank","theft","their","theme","there","these",
  "thick","thief","thing","think","third","those","three","threw","throw","thumb",
  "tidal","tiger","tight","timer","times","tired","title","toast","today","token",
  "topic","torch","total","touch","tough","tower","toxic","trace","track","trade",
  "train","trait","trash","treat","trend","trial","tribe","trick","tried","tries",
  "truck","trump","trunk","trust","truth","tulip","tumor","tuner","tweed","twice",
  "twist","tying","ultra","uncle","under","undid","union","unite","unity","until",
  "upper","upset","urban","usage","usual","valid","valley","value","vapor","vault",
  "venue","video","villa","vinyl","viola","virus","visit","vital","vivid","vocal",
  "vodka","voice","vowel","wagon","waist","waltz","waste","watch","water","weary",
  "weave","weigh","weird","whale","wharf","wheat","wheel","where","which","while",
  "whirl","white","whole","whose","widen","width","willow","winch","windy","wiser",
  "witch","woman","world","worry","worse","worst","worth","would","wound","wreck",
  "wrist","write","wrong","wrote","yacht","yeast","yield","young","youth","zebra",
];

// Filter out anything that isn't exactly 5 letters (defensive — easy to
// fat-finger when editing).
window.ZD_ANSWERS = window.ZD_ANSWERS.filter((w) => /^[a-z]{5}$/.test(w));

// Same list serves as the allowed-guess pool for now. Extend with a
// bigger dictionary later if you want stricter validation.
window.ZD_ALLOWED = new Set(window.ZD_ANSWERS);
