/* Fighter keys of the mastery points (the ui_chara_db name without "ui_chara_", OPENSMASH_MASTERY_SPEC) -> names and icons.
   Used by the mastery page, the home's top 10 and the account page. An unknown key shows as itself.
   Icons: Max_Hamm's stock icons as SSBU Arena serves them (https://www.ssbuarena.com/fighters/<key>/<costume>.webp, 64 px,
   and <costume>@2x.webp, 128 px), loaded from there: no image is kept in this repository. Credited under every table that
   shows them (OSU_ICON_CREDIT). A key without an icon, or an image that fails to load, shows the name's initial. */
(function () {
  "use strict";
  var N = {
    mario: "Mario", donkey: "Donkey Kong", link: "Link", samus: "Samus", samusd: "Dark Samus", yoshi: "Yoshi",
    kirby: "Kirby", fox: "Fox", pikachu: "Pikachu", luigi: "Luigi", ness: "Ness", captain: "Captain Falcon",
    purin: "Jigglypuff", peach: "Peach", daisy: "Daisy", koopa: "Bowser", ice_climber: "Ice Climbers", popo: "Ice Climbers",
    nana: "Ice Climbers", sheik: "Sheik", zelda: "Zelda", mariod: "Dr. Mario", pichu: "Pichu", falco: "Falco",
    marth: "Marth", lucina: "Lucina", younglink: "Young Link", ganon: "Ganondorf", mewtwo: "Mewtwo", roy: "Roy",
    chrom: "Chrom", gamewatch: "Mr. Game & Watch", metaknight: "Meta Knight", pit: "Pit", pitb: "Dark Pit",
    szerosuit: "Zero Suit Samus", wario: "Wario", snake: "Snake", ike: "Ike", ptrainer: "Pokemon Trainer",
    ptrainer_low: "Pokemon Trainer", pzenigame: "Squirtle", pfushigisou: "Ivysaur", plizardon: "Charizard",
    diddy: "Diddy Kong", lucas: "Lucas", sonic: "Sonic", dedede: "King Dedede", pikmin: "Olimar", lucario: "Lucario",
    robot: "R.O.B.", toonlink: "Toon Link", wolf: "Wolf", murabito: "Villager", rockman: "Mega Man",
    wiifit: "Wii Fit Trainer", rosetta: "Rosalina & Luma", littlemac: "Little Mac", gekkouga: "Greninja",
    palutena: "Palutena", pacman: "Pac-Man", reflet: "Robin", shulk: "Shulk", koopajr: "Bowser Jr.",
    duckhunt: "Duck Hunt", ryu: "Ryu", ken: "Ken", cloud: "Cloud", kamui: "Corrin", bayonetta: "Bayonetta",
    inkling: "Inkling", ridley: "Ridley", simon: "Simon", richter: "Richter", krool: "King K. Rool", shizue: "Isabelle",
    gaogaen: "Incineroar", packun: "Piranha Plant", jack: "Joker", brave: "Hero", buddy: "Banjo & Kazooie",
    dolly: "Terry", master: "Byleth", tantan: "Min Min", pickel: "Steve", edge: "Sephiroth", eflame: "Pyra",
    elight: "Mythra", eflame_first: "Pyra", elight_first: "Mythra", eflame_only: "Pyra", elight_only: "Mythra",
    element: "Pyra / Mythra", demon: "Kazuya", trail: "Sora", miifighter: "Mii Brawler",
    miiswordsman: "Mii Swordfighter", miigunner: "Mii Gunner"
  };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* Any spelling -> the key above: the game keys (jack, pzenigame, popo ...), and names and common aliases in any case,
     spacing or punctuation ("joker", "Pyra / Mythra", "PT", "ice climbers", "mii fighter" ...). Compared squashed: lower
     case, letters and digits only. */
  var squash = function (v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9]+/g, ""); };
  var ALIAS = {};
  Object.keys(N).forEach(function (k) { ALIAS[squash(k)] = k; });
  Object.keys(N).forEach(function (k) { if (!has(ALIAS, squash(N[k]))) ALIAS[squash(N[k])] = k; });
  ("joker:jack hero:brave banjo:buddy banjokazooie:buddy terry:dolly terrybogard:dolly byleth:master minmin:tantan steve:pickel " +
   "alex:pickel sephiroth:edge pyra:eflame mythra:elight pyramythra:element aegis:element kazuya:demon sora:trail " +
   "pt:ptrainer pokemontrainer:ptrainer pokmontrainer:ptrainer trainer:ptrainer squirtle:pzenigame ivysaur:pfushigisou charizard:plizardon " +
   "iceclimbers:ice_climber iceclimber:ice_climber ics:ice_climber icies:ice_climber " +
   "mii:miifighter miifighter:miifighter miifighters:miifighter brawler:miifighter miibrawler:miifighter " +
   "miisword:miiswordsman miiswordfighter:miiswordsman swordfighter:miiswordsman miigunner:miigunner gunner:miigunner " +
   "dk:donkey donkeykong:donkey diddykong:diddy kingkrool:krool krool:krool dedede:dedede kingdedede:dedede " +
   "falcon:captain captainfalcon:captain cf:captain jigglypuff:purin puff:purin bowser:koopa bowserjr:koopajr " +
   "drmario:mariod doc:mariod younglink:younglink yink:younglink toonlink:toonlink tink:toonlink ganondorf:ganon ganon:ganon " +
   "gameandwatch:gamewatch mrgameandwatch:gamewatch gnw:gamewatch gw:gamewatch metaknight:metaknight mk:metaknight " +
   "darkpit:pitb darksamus:samusd zss:szerosuit zerosuitsamus:szerosuit olimar:pikmin alph:pikmin rob:robot " +
   "villager:murabito megaman:rockman wiifittrainer:wiifit wft:wiifit rosalina:rosetta rosalinaluma:rosetta luma:rosetta " +
   "littlemac:littlemac mac:littlemac greninja:gekkouga pacman:pacman robin:reflet corrin:kamui isabelle:shizue " +
   "incineroar:gaogaen piranhaplant:packun plant:packun duckhunt:duckhunt dh:duckhunt rob:robot " +
   "drmario:mariod mrgamewatch:gamewatch belmont:simon").split(" ").forEach(function (pair) {
    var kv = pair.split(":");
    ALIAS[squash(kv[0])] = kv[1];
  });
  /* The key of a fighter given any spelling, or null for an unknown one. */
  window.OSU_FIGHTER_KEY = function (v) {
    var q = squash(v);
    return q && has(ALIAS, q) ? ALIAS[q] : null;
  };
  /* A fighter's display name from any spelling; an unknown one shows as given. */
  window.OSU_FIGHTER = function (key) {
    var k = window.OSU_FIGHTER_KEY(key);
    return k ? N[k] : String(key == null ? "" : key);
  };

  /* Every fighter once, by the key the points are stored under (the keys SSBU Arena's database maps names to): the
     mastery page's fighter list, in name order. */
  window.OSU_FIGHTER_KEYS = ("mario donkey link samus samusd yoshi kirby fox pikachu luigi ness captain purin peach daisy koopa " +
    "ice_climber sheik zelda mariod pichu falco marth lucina younglink ganon mewtwo roy chrom gamewatch metaknight pit pitb szerosuit " +
    "wario snake ike ptrainer diddy lucas sonic dedede pikmin lucario robot toonlink wolf murabito rockman wiifit rosetta littlemac " +
    "gekkouga palutena pacman reflet shulk koopajr duckhunt ryu ken cloud kamui bayonetta inkling ridley simon richter krool shizue " +
    "gaogaen packun jack brave buddy dolly master tantan pickel edge element demon trail miifighter miiswordsman miigunner").split(" ")
    .sort(function (a, b) { return window.OSU_FIGHTER(a).localeCompare(window.OSU_FIGHTER(b)); });

  var ICON_BASE = "https://www.ssbuarena.com/fighters/";
  /* The folders SSBU Arena serves (its src/lib/fighter-icons.ts); costume 1 of each, except Ridley (5: it has no 1). */
  var ICONS = ("bayonetta brave buddy captain chrom cloud daisy dedede demon diddy dolly donkey duckhunt edge eflame elight " +
    "falco fox gamewatch ganon gaogaen gekkouga ice_climber ike inkling jack kamui ken kirby koopa koopajr krool link littlemac " +
    "lucario lucas lucina luigi mario mariod marth master metaknight mewtwo miifighter miigunner miiswordsman murabito ness " +
    "packun pacman palutena peach pfushigisou pichu pickel pikachu pikmin pit pitb plizardon ptrainer purin pzenigame reflet " +
    "richter ridley robot rockman rosetta roy ryu samus samusd sheik shizue shulk simon snake sonic szerosuit tantan toonlink " +
    "trail wario wiifit wolf yoshi younglink zelda").split(" ");
  var ICON_KEY = { popo: "ice_climber", nana: "ice_climber", ptrainer_low: "ptrainer", element: "eflame", eflame_first: "eflame",
    eflame_only: "eflame", elight_first: "elight", elight_only: "elight" };
  var COSTUME = { ridley: 5 };
  /* {src, src2x} of a fighter key, or null. */
  window.OSU_FIGHTER_ICON = function (key) {
    key = window.OSU_FIGHTER_KEY(key) || "";
    var k = has(ICON_KEY, key) ? ICON_KEY[key] : key;
    if (ICONS.indexOf(k) < 0) return null;
    var n = has(COSTUME, k) ? COSTUME[k] : 1;
    return { src: ICON_BASE + k + "/" + n + ".webp", src2x: ICON_BASE + k + "/" + n + "@2x.webp" };
  };
  /* A fighter as a 28 px element (cls "ficon"): the stock icon, or the name's initial on a disc if there is none or it
     fails to load. The fighter's name is the alt text and the tooltip. */
  window.OSU_FIGHTER_EL = function (key, size) {
    var name = key ? window.OSU_FIGHTER(key) : "", px = size || 28, icon = key ? window.OSU_FIGHTER_ICON(key) : null;
    function initial() {
      var s = document.createElement("span");
      s.className = "ficon ficon-initial";
      s.style.width = s.style.height = px + "px";
      s.textContent = (name || "?").charAt(0).toUpperCase();
      if (name) { s.title = name; s.setAttribute("role", "img"); s.setAttribute("aria-label", name); } else s.setAttribute("aria-hidden", "true");
      return s;
    }
    if (!icon) return initial();
    var img = document.createElement("img");
    img.className = "ficon";
    img.alt = name; img.title = name;
    img.width = img.height = px;
    img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.replaceChild(initial(), img); });
    img.srcset = icon.src + " 64w, " + icon.src2x + " 128w";
    img.sizes = px + "px";
    img.src = icon.src;
    return img;
  };
  /* "Stock icons by Max_Hamm" under a table of icons (the same credit as SSBU Arena's leaderboard). */
  window.OSU_ICON_CREDIT = function () {
    var p = document.createElement("p"), a = document.createElement("a");
    p.className = "icon-credit";
    p.appendChild(document.createTextNode("Stock icons by "));
    a.href = "https://www.reddit.com/r/smashbros/comments/1g8u7ug/i_made_200x200_pixel_versions_of_every_stock_icon/";
    a.rel = "noopener noreferrer"; a.target = "_blank";
    a.textContent = "Max_Hamm";
    p.appendChild(a);
    return p;
  };
})();
