"""US / UK / AU / NZ spelling and regional vocabulary."""

LOCALES = {
    "en-US": 0,
    "en-GB": 1,
    "en-AU": 1,
    "en-NZ": 1,
}

VOCABULARY_PAIRS = [
    ("truck", "lorry"),
    ("elevator", "lift"),
    ("apartment", "flat"),
    ("gasoline", "petrol"),
    ("sidewalk", "pavement"),
    ("vacation", "holiday"),
    ("faucet", "tap"),
    ("diaper", "nappy"),
    ("candy", "sweets"),
    ("pants", "trousers"),
    ("sweater", "jumper"),
    ("eggplant", "aubergine"),
    ("zucchini", "courgette"),
    ("cilantro", "coriander"),
    ("windshield", "windscreen"),
    ("highway", "motorway"),
    ("freeway", "motorway"),
    ("trash", "rubbish"),
    ("garbage", "rubbish"),
    ("dumpster", "skip"),
    ("flashlight", "torch"),
    ("pacifier", "dummy"),
    ("stroller", "pram"),
    ("hood", "bonnet"),
    ("trunk", "boot"),
    ("fall", "autumn"),
    ("cellphone", "mobile"),
    ("mom", "mum"),
    ("mailbox", "postbox"),
    ("cookie", "biscuit"),
    ("eraser", "rubber"),
    ("drugstore", "chemist"),
    ("pharmacy", "chemist"),
    ("restroom", "toilet"),
    ("attorney", "solicitor"),
    ("lawyer", "solicitor"),
    ("trailer", "caravan"),
    ("station wagon", "estate"),
    ("sedan", "saloon"),
    ("counterclockwise", "anticlockwise"),
    ("soccer", "football"),
    ("math", "maths"),
    ("bangs", "fringe"),
    ("sneakers", "trainers"),
    ("bill", "note"),
    ("stove", "cooker"),
    ("broil", "grill"),
    ("jelly", "jam"),
    ("bar", "pub"),
]

VOCABULARY_PHRASES = [
    ("parking lot", "car park"),
    ("zip code", "postcode"),
    ("cell phone", "mobile phone"),
    ("trash can", "rubbish bin"),
    ("garbage can", "rubbish bin"),
    ("baby carriage", "pram"),
    ("driver's license", "driving licence"),
    ("drivers license", "driving licence"),
    ("high school", "secondary school"),
    ("turn signal", "indicator"),
]

VOCABULARY_AU_EXTRA = [
    ("gas station", "petrol station"),
    ("service station", "servo"),
]

VOCABULARY_NZ_EXTRA = [
    ("cooler", "chilly bin"),
    ("flip flops", "jandals"),
]

# [American, British] pairs
SPELLING_PAIRS = [
    ("center", "centre"),
    ("color", "colour"),
    ("favorite", "favourite"),
    ("honor", "honour"),
    ("behavior", "behaviour"),
    ("organize", "organise"),
    ("organized", "organised"),
    ("organizing", "organising"),
    ("analyze", "analyse"),
    ("analyzed", "analysed"),
    ("recognize", "recognise"),
    ("realize", "realise"),
    ("defense", "defence"),
    ("theater", "theatre"),
    ("meter", "metre"),
    ("traveling", "travelling"),
    ("traveled", "travelled"),
    ("gray", "grey"),
    ("judgment", "judgement"),
    ("license", "licence"),
    ("offense", "offence"),
    ("neighbor", "neighbour"),
    ("flavor", "flavour"),
    ("labor", "labour"),
    ("humor", "humour"),
    ("catalog", "catalogue"),
    ("dialog", "dialogue"),
    ("fulfill", "fulfil"),
    ("canceled", "cancelled"),
    ("modeling", "modelling"),
    ("pajamas", "pyjamas"),
]


def _preserve_case(original: str, replacement: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement.lower()


def build_locale_map(locale: str) -> dict[str, str]:
    """Map wrong/lowercase word -> target spelling for locale."""
    idx = LOCALES.get(locale, 0)
    mapping: dict[str, str] = {}
    for us, gb in SPELLING_PAIRS:
        target = us if idx == 0 else gb
        for variant in (us, gb):
            if variant.lower() != target.lower():
                mapping[variant.lower()] = target
    # Common typos (both locales)
    mapping["definately"] = "definitely"
    mapping["seperate"] = "separate"
    mapping["occured"] = "occurred"
    mapping["recieve"] = "receive"
    mapping["acommodate"] = "accommodate"
    mapping["begining"] = "beginning"
    mapping["untill"] = "until"
    mapping["wich"] = "which"
    mapping["thier"] = "their"
    mapping["infron"] = "in front"
    mapping["infront"] = "in front"
    mapping["coty"] = "city"
    mapping["trafic"] = "traffic"
    mapping["stret"] = "street"
    mapping["monts"] = "months"
    mapping["coty"] = "city"
    mapping["trafic"] = "traffic"
    mapping["stret"] = "street"
    mapping["monts"] = "months"
    mapping["teh"] = "the"
    mapping["adn"] = "and"
    mapping["taht"] = "that"
    mapping["alot"] = "a lot"
    mapping["arguement"] = "argument"
    mapping["beleive"] = "believe"
    mapping["calender"] = "calendar"
    mapping["collegue"] = "colleague"
    mapping["comming"] = "coming"
    mapping["concious"] = "conscious"
    mapping["embarass"] = "embarrass"
    mapping["enviroment"] = "environment"
    mapping["existance"] = "existence"
    mapping["goverment"] = "government"
    mapping["harrass"] = "harass"
    mapping["independant"] = "independent"
    mapping["knowlege"] = "knowledge"
    mapping["liason"] = "liaison"
    mapping["maintainance"] = "maintenance"
    mapping["neccessary"] = "necessary"
    mapping["noticable"] = "noticeable"
    mapping["occassion"] = "occasion"
    mapping["paralell"] = "parallel"
    mapping["persistant"] = "persistent"
    mapping["posession"] = "possession"
    mapping["privelege"] = "privilege"
    mapping["publically"] = "publicly"
    mapping["recomend"] = "recommend"
    mapping["refered"] = "referred"
    mapping["relevent"] = "relevant"
    mapping["resistence"] = "resistance"
    mapping["sentance"] = "sentence"
    mapping["succesful"] = "successful"
    mapping["suprise"] = "surprise"
    mapping["tommorow"] = "tomorrow"
    mapping["truely"] = "truly"
    mapping["usefull"] = "useful"
    mapping["wierd"] = "weird"
    mapping["writting"] = "writing"
    mapping["acheive"] = "achieve"
    mapping["adress"] = "address"
    mapping["forgetter"] = "forgot"
    mapping["forgoted"] = "forgot"
    mapping["forgotted"] = "forgot"
    mapping["forgetted"] = "forgot"
    mapping["forgetten"] = "forgot"
    mapping["forgotton"] = "forgotten"
    mapping["runned"] = "ran"
    mapping["goed"] = "went"
    mapping["buyed"] = "bought"
    mapping["catched"] = "caught"
    mapping["teached"] = "taught"
    mapping["thinked"] = "thought"
    mapping["allready"] = "already"
    mapping["ammount"] = "amount"
    mapping["aparent"] = "apparent"
    mapping["apreciate"] = "appreciate"
    mapping["aquire"] = "acquire"
    mapping["basicly"] = "basically"
    mapping["becuase"] = "because"
    mapping["becomeing"] = "becoming"
    mapping["benifit"] = "benefit"
    mapping["buisness"] = "business"
    mapping["carefull"] = "careful"
    mapping["cemetary"] = "cemetery"
    mapping["changable"] = "changeable"
    mapping["comittee"] = "committee"
    mapping["completly"] = "completely"
    mapping["concieve"] = "conceive"
    mapping["conciousness"] = "consciousness"
    mapping["copywrite"] = "copyright"
    mapping["critisism"] = "criticism"
    mapping["curiousity"] = "curiosity"
    mapping["decaffinated"] = "decaffeinated"
    mapping["decathalon"] = "decathlon"
    mapping["definate"] = "definite"
    mapping["develope"] = "develop"
    mapping["dissapear"] = "disappear"
    mapping["dissapoint"] = "disappoint"
    mapping["dumbell"] = "dumbbell"
    mapping["excede"] = "exceed"
    mapping["exilerate"] = "exhilarate"
    mapping["facinating"] = "fascinating"
    mapping["Febuary"] = "February"
    mapping["firey"] = "fiery"
    mapping["flourescent"] = "fluorescent"
    mapping["foriegn"] = "foreign"
    mapping["fourty"] = "forty"
    mapping["freind"] = "friend"
    mapping["fulfill"] = "fulfil" if idx != 0 else "fulfill"
    mapping["gaurd"] = "guard"
    mapping["gratefull"] = "grateful"
    mapping["greatful"] = "grateful"
    mapping["hieght"] = "height"
    mapping["humerous"] = "humorous"
    mapping["hygeine"] = "hygiene"
    mapping["ignorence"] = "ignorance"
    mapping["imediate"] = "immediate"
    mapping["incidently"] = "incidentally"
    mapping["independance"] = "independence"
    mapping["interupt"] = "interrupt"
    mapping["irresistable"] = "irresistible"
    mapping["jewlery"] = "jewelry" if idx == 0 else "jewellery"
    mapping["judgement"] = "judgment" if idx == 0 else "judgement"
    mapping["lenght"] = "length"
    mapping["libary"] = "library"
    mapping["lightening"] = "lightning"
    return mapping


def _preserve_case_phrase(original: str, replacement: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def build_vocab_map(locale: str) -> dict[str, str]:
    idx = LOCALES.get(locale, 0)
    mapping: dict[str, str] = {}
    for us, brit in VOCABULARY_PAIRS:
        if idx == 0:
            if brit.lower() != us.lower():
                mapping[brit.lower()] = us
        else:
            if us.lower() != brit.lower():
                mapping[us.lower()] = brit
    if locale == "en-AU":
        for us, au in VOCABULARY_AU_EXTRA:
            if idx == 0:
                if au.lower() != us.lower():
                    mapping[au.lower()] = us
            else:
                if us.lower() != au.lower():
                    mapping[us.lower()] = au
    elif locale == "en-NZ":
        for us, nz in VOCABULARY_NZ_EXTRA:
            if idx == 0:
                if nz.lower() != us.lower():
                    mapping[nz.lower()] = us
            else:
                if us.lower() != nz.lower():
                    mapping[us.lower()] = nz
    return mapping


def get_vocab_keys(locale: str) -> set[str]:
    return set(build_vocab_map(locale).keys())


def get_locale_word_maps(locale: str) -> tuple[dict[str, str], set[str]]:
    spelling = build_locale_map(locale)
    vocab = build_vocab_map(locale)
    vocab_keys = set(vocab.keys())
    combined = dict(spelling)
    combined.update(vocab)
    return combined, vocab_keys


def locale_label(locale: str) -> str:
    labels = {
        "en-US": "American English",
        "en-GB": "British English",
        "en-AU": "Australian English",
        "en-NZ": "New Zealand English",
    }
    return labels.get(locale, locale)
