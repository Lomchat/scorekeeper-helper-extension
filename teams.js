/* teams.js — dictionnaire de correspondance des noms d'équipes (FR <-> EN)
 * et logique de rapprochement tolérant (accents, doublons, espaces, tirets, fautes légères).
 * Exposé sur globalThis.ScoreSyncTeams pour être utilisé par content.js. */
(function () {
  "use strict";

  // [code, [alias FR / EN / variantes...]]
  const TEAM_GROUPS = [
    // --- Europe ---
    ["FRA", ["france"]],
    ["ENG", ["angleterre", "england"]],
    ["GER", ["allemagne", "germany"]],
    ["ESP", ["espagne", "spain"]],
    ["ITA", ["italie", "italy"]],
    ["POR", ["portugal"]],
    ["NED", ["pays-bas", "pays bas", "netherlands", "holland", "hollande"]],
    ["BEL", ["belgique", "belgium"]],
    ["CRO", ["croatie", "croatia"]],
    ["SUI", ["suisse", "switzerland"]],
    ["AUT", ["autriche", "austria"]],
    ["POL", ["pologne", "poland"]],
    ["SWE", ["suede", "sweden"]],
    ["NOR", ["norvege", "norway"]],
    ["DEN", ["danemark", "denmark"]],
    ["FIN", ["finlande", "finland"]],
    ["ISL", ["islande", "iceland"]],
    ["IRL", ["irlande", "ireland", "republique d'irlande", "republic of ireland"]],
    ["NIR", ["irlande du nord", "northern ireland"]],
    ["SCO", ["ecosse", "scotland"]],
    ["WAL", ["pays de galles", "wales"]],
    ["CZE", ["tchequie", "republique tcheque", "czechia", "czech republic"]],
    ["SVK", ["slovaquie", "slovakia"]],
    ["SVN", ["slovenie", "slovenia"]],
    ["SRB", ["serbie", "serbia"]],
    ["UKR", ["ukraine"]],
    ["RUS", ["russie", "russia"]],
    ["ROU", ["roumanie", "romania"]],
    ["HUN", ["hongrie", "hungary"]],
    ["GRE", ["grece", "greece"]],
    ["TUR", ["turquie", "turkey", "turkiye"]],
    ["BUL", ["bulgarie", "bulgaria"]],
    ["GEO", ["georgie", "georgia"]],
    ["ALB", ["albanie", "albania"]],
    ["BIH", ["bosnie", "bosnie-herzegovine", "bosnie herzegovine", "bosnia", "bosnia and herzegovina", "bosnia-herzegovina", "bosnia-herz", "bosnia herz", "bosnie-herz", "herzegovine", "herzegovina"]],
    ["MKD", ["macedoine du nord", "north macedonia", "macedoine"]],
    ["MNE", ["montenegro"]],
    ["LUX", ["luxembourg"]],
    ["KVX", ["kosovo"]],
    ["BLR", ["bielorussie", "belarus"]],

    // --- Amériques ---
    ["BRA", ["bresil", "brazil"]],
    ["ARG", ["argentine", "argentina"]],
    ["URU", ["uruguay"]],
    ["COL", ["colombie", "colombia"]],
    ["CHI", ["chili", "chile"]],
    ["PER", ["perou", "peru"]],
    ["ECU", ["equateur", "ecuador"]],
    ["PAR", ["paraguay"]],
    ["BOL", ["bolivie", "bolivia"]],
    ["VEN", ["venezuela"]],
    ["USA", ["etats-unis", "etats unis", "united states", "usa", "etats-unis d'amerique"]],
    ["MEX", ["mexique", "mexico"]],
    ["CAN", ["canada"]],
    ["CRC", ["costa rica"]],
    ["PAN", ["panama"]],
    ["HON", ["honduras"]],
    ["JAM", ["jamaique", "jamaica"]],
    ["HAI", ["haiti"]],

    // --- Afrique ---
    ["MAR", ["maroc", "morocco"]],
    ["SEN", ["senegal"]],
    ["EGY", ["egypte", "egypt"]],
    ["NGA", ["nigeria", "nigéria"]],
    ["CMR", ["cameroun", "cameroon"]],
    ["GHA", ["ghana"]],
    ["CIV", ["cote d'ivoire", "cote divoire", "ivory coast"]],
    ["ALG", ["algerie", "algeria"]],
    ["TUN", ["tunisie", "tunisia"]],
    ["RSA", ["afrique du sud", "south africa"]],
    ["MLI", ["mali"]],
    ["BFA", ["burkina faso", "burkina"]],
    ["COD", ["rd congo", "republique democratique du congo", "dr congo", "congo dr", "rdc"]],
    ["CGO", ["congo", "republique du congo"]],
    ["GAB", ["gabon"]],
    ["GUI", ["guinee", "guinea"]],
    ["CPV", ["cap-vert", "cap vert", "cape verde"]],
    ["ZAM", ["zambie", "zambia"]],
    ["ANG", ["angola"]],
    ["KEN", ["kenya"]],
    ["ETH", ["ethiopie", "ethiopia"]],
    ["UGA", ["ouganda", "uganda"]],

    // --- Asie / Océanie ---
    ["JPN", ["japon", "japan"]],
    ["KOR", ["coree du sud", "south korea", "korea republic", "coree"]],
    ["PRK", ["coree du nord", "north korea"]],
    ["AUS", ["australie", "australia"]],
    ["KSA", ["arabie saoudite", "saudi arabia"]],
    ["IRN", ["iran"]],
    ["IRQ", ["irak", "iraq"]],
    ["QAT", ["qatar"]],
    ["UAE", ["emirats arabes unis", "united arab emirates", "uae", "emirats"]],
    ["CHN", ["chine", "china"]],
    ["IND", ["inde", "india"]],
    ["THA", ["thailande", "thailand"]],
    ["VIE", ["vietnam", "viet nam"]],
    ["IDN", ["indonesie", "indonesia"]],
    ["MAS", ["malaisie", "malaysia"]],
    ["UZB", ["ouzbekistan", "uzbekistan"]],
    ["JOR", ["jordanie", "jordan"]],
    ["SYR", ["syrie", "syria"]],
    ["OMA", ["oman"]],
    ["BHR", ["bahrein", "bahrain"]],
    ["KUW", ["koweit", "kuwait"]],
    ["LBN", ["liban", "lebanon"]],
    ["PLE", ["palestine"]],
    ["NZL", ["nouvelle-zelande", "nouvelle zelande", "new zealand"]]
  ];

  function stripAccents(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  // Normalisation "lâche" : minuscules, sans accents, sans séparateurs,
  // et lettres doublées réduites (toléere "doublées ou non").
  function normLoose(s) {
    return stripAccents(s)
      .toLowerCase()
      .replace(/&/g, "et")
      .replace(/[^a-z0-9]+/g, "")
      .replace(/(.)\1+/g, "$1");
  }

  const CANON = new Map();        // normLoose(alias) -> code
  const CODE_VARIANTS = new Map(); // code -> [normLoose alias...]
  for (const [code, names] of TEAM_GROUPS) {
    const vs = [];
    for (const n of names) {
      const k = normLoose(n);
      CANON.set(k, code);
      vs.push(k);
    }
    CODE_VARIANTS.set(code, vs);
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      let cur = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  function fuzzTol(x, y) {
    const m = Math.min(x.length, y.length);
    if (m <= 4) return 1;
    if (m <= 8) return 2;
    return 3;
  }

  // Renvoie le code dictionnaire si connu, sinon undefined.
  function codeOf(name) {
    return CANON.get(normLoose(name));
  }

  // Égalité de deux noms d'équipe, tolérante.
  function teamsEqual(a, b) {
    const ca = codeOf(a), cb = codeOf(b);
    if (ca && cb) return ca === cb;            // deux équipes connues -> on fait confiance au dico

    // Au moins une inconnue : on compare toutes les variantes en fuzzy.
    const setA = ca ? CODE_VARIANTS.get(ca) : [normLoose(a)];
    const setB = cb ? CODE_VARIANTS.get(cb) : [normLoose(b)];
    for (const x of setA) {
      for (const y of setB) {
        if (x === y) return true;
        if (lev(x, y) <= fuzzTol(x, y)) return true;
      }
    }
    return false;
  }

  globalThis.ScoreSyncTeams = {
    TEAM_GROUPS,
    normLoose,
    codeOf,
    teamsEqual,
    lev
  };
})();
