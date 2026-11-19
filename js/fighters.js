/* Fighter keys of the mastery points (the ui_chara_db name without "ui_chara_", OPENSMASH_MASTERY_SPEC) -> names.
   Used by the mastery page, the home's top 10 and the account page. An unknown key shows as itself. */
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
  window.OSU_FIGHTER = function (key) {
    key = String(key == null ? "" : key);
    return Object.prototype.hasOwnProperty.call(N, key) ? N[key] : key;
  };
})();
