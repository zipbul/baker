import type { EmitContext, EmittableRule } from './interfaces';

import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

// ISO 8601
const ISO8601_RE = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

interface IsISO8601Options {
  strict?: boolean;
}

// Strict ISO8601: requires month/day AND hour/minute/second to be valid values
function validateISO8601Strict(v: string): boolean {
  if (!ISO8601_RE.test(v)) {
    return false;
  }
  const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) {
    return true;
  } // year-only — no month/day to range-check
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return false;
  }
  if (m[3] !== undefined) {
    const day = Number(m[3]);
    const maxDay = new Date(Number(m[1]), month, 0).getDate();
    if (day < 1 || day > maxDay) {
      return false;
    }
  }
  // Time component check: hour 0-23, minute 0-59, second 0-60 (leap second).
  const tm = v.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!tm) {
    return true;
  }
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const ss = Number(tm[3]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 60;
}

function isISO8601(options?: IsISO8601Options): EmittableRule {
  if (options?.strict) {
    const validateStrict = (v: unknown): boolean => typeof v === 'string' && validateISO8601Strict(v);
    return makeRule({
      name: 'isISO8601',
      requiresType: RequiredType.String,
      constraints: { format: 'date-time', strict: true },
      validate: validateStrict,
      emit: (varName: string, ctx: EmitContext): string => {
        const i = ctx.addRegex(ISO8601_RE);
        // Single `__iso_ok` flag so the rule fails AT MOST once: in collect-errors mode `ctx.fail()`
        // pushes without returning, so the date and time checks must funnel into one failure. The time
        // check runs only when the date portion is valid, mirroring `validateISO8601Strict`'s early returns.
        return (
          `if (!re[${i}].test(${varName})) ${ctx.fail('isISO8601')};\n` +
          `else {var __iso_ok=true;` +
          `var dm=${varName}.match(/^(\\d{4})-(\\d{2})(?:-(\\d{2}))?/);` +
          `if(dm){var mo=Number(dm[2]);` +
          `if(mo<1||mo>12){__iso_ok=false;}` +
          `else if(dm[3]!==undefined){var da=Number(dm[3]),md=new Date(Number(dm[1]),mo,0).getDate();` +
          `if(da<1||da>md){__iso_ok=false;}}}` +
          `if(__iso_ok){var tm=${varName}.match(/T(\\d{2}):(\\d{2}):(\\d{2})/);` +
          `if(tm){var hh=Number(tm[1]),mm=Number(tm[2]),ss=Number(tm[3]);` +
          `if(hh<0||hh>23||mm<0||mm>59||ss<0||ss>60)__iso_ok=false;}}` +
          `if(!__iso_ok)${ctx.fail('isISO8601')};}`
        );
      },
    });
  }
  // non-strict: both validate and emit use same ISO8601_RE
  return makeStringRule(
    'isISO8601',
    v => ISO8601_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(ISO8601_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isISO8601')};`;
    },
    RequiredType.String,
    { format: 'date-time', strict: false },
  );
}

// ISRC — ISO 3901
const ISRC_RE = /^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$|^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const isISRC = makeStringRule(
  'isISRC',
  v => ISRC_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(ISRC_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isISRC')};`;
  },
);

// ISO 3166-1 Alpha-2
const ISO31661A2_CODES = new Set([
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW',
]);

const isISO31661Alpha2 = makeRule({
  name: 'isISO31661Alpha2',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && ISO31661A2_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A2_CODES);
    return `if (!refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha2')};`;
  },
});

// ISO 3166-1 Alpha-3
const ISO31661A3_CODES = new Set([
  'ABW',
  'AFG',
  'AGO',
  'AIA',
  'ALA',
  'ALB',
  'AND',
  'ARE',
  'ARG',
  'ARM',
  'ASM',
  'ATA',
  'ATF',
  'ATG',
  'AUS',
  'AUT',
  'AZE',
  'BDI',
  'BEL',
  'BEN',
  'BES',
  'BFA',
  'BGD',
  'BGR',
  'BHR',
  'BHS',
  'BIH',
  'BLM',
  'BLR',
  'BLZ',
  'BMU',
  'BOL',
  'BRA',
  'BRB',
  'BRN',
  'BTN',
  'BVT',
  'BWA',
  'CAF',
  'CAN',
  'CCK',
  'CHE',
  'CHL',
  'CHN',
  'CIV',
  'CMR',
  'COD',
  'COG',
  'COK',
  'COL',
  'COM',
  'CPV',
  'CRI',
  'CUB',
  'CUW',
  'CXR',
  'CYM',
  'CYP',
  'CZE',
  'DEU',
  'DJI',
  'DMA',
  'DNK',
  'DOM',
  'DZA',
  'ECU',
  'EGY',
  'ERI',
  'ESH',
  'ESP',
  'EST',
  'ETH',
  'FIN',
  'FJI',
  'FLK',
  'FRA',
  'FRO',
  'FSM',
  'GAB',
  'GBR',
  'GEO',
  'GGY',
  'GHA',
  'GIB',
  'GIN',
  'GLP',
  'GMB',
  'GNB',
  'GNQ',
  'GRC',
  'GRD',
  'GRL',
  'GTM',
  'GUF',
  'GUM',
  'GUY',
  'HKG',
  'HMD',
  'HND',
  'HRV',
  'HTI',
  'HUN',
  'IDN',
  'IMN',
  'IND',
  'IOT',
  'IRL',
  'IRN',
  'IRQ',
  'ISL',
  'ISR',
  'ITA',
  'JAM',
  'JEY',
  'JOR',
  'JPN',
  'KAZ',
  'KEN',
  'KGZ',
  'KHM',
  'KIR',
  'KNA',
  'KOR',
  'KWT',
  'LAO',
  'LBN',
  'LBR',
  'LBY',
  'LCA',
  'LIE',
  'LKA',
  'LSO',
  'LTU',
  'LUX',
  'LVA',
  'MAC',
  'MAF',
  'MAR',
  'MCO',
  'MDA',
  'MDG',
  'MDV',
  'MEX',
  'MHL',
  'MKD',
  'MLI',
  'MLT',
  'MMR',
  'MNE',
  'MNG',
  'MNP',
  'MOZ',
  'MRT',
  'MSR',
  'MTQ',
  'MUS',
  'MWI',
  'MYS',
  'MYT',
  'NAM',
  'NCL',
  'NER',
  'NFK',
  'NGA',
  'NIC',
  'NIU',
  'NLD',
  'NOR',
  'NPL',
  'NRU',
  'NZL',
  'OMN',
  'PAK',
  'PAN',
  'PCN',
  'PER',
  'PHL',
  'PLW',
  'PNG',
  'POL',
  'PRI',
  'PRK',
  'PRT',
  'PRY',
  'PSE',
  'PYF',
  'QAT',
  'REU',
  'ROU',
  'RUS',
  'RWA',
  'SAU',
  'SDN',
  'SEN',
  'SGP',
  'SGS',
  'SHN',
  'SJM',
  'SLB',
  'SLE',
  'SLV',
  'SMR',
  'SOM',
  'SPM',
  'SRB',
  'SSD',
  'STP',
  'SUR',
  'SVK',
  'SVN',
  'SWE',
  'SWZ',
  'SXM',
  'SYC',
  'SYR',
  'TCA',
  'TCD',
  'TGO',
  'THA',
  'TJK',
  'TKL',
  'TKM',
  'TLS',
  'TON',
  'TTO',
  'TUN',
  'TUR',
  'TUV',
  'TWN',
  'TZA',
  'UGA',
  'UKR',
  'UMI',
  'URY',
  'USA',
  'UZB',
  'VAT',
  'VCT',
  'VEN',
  'VGB',
  'VIR',
  'VNM',
  'VUT',
  'WLF',
  'WSM',
  'YEM',
  'ZAF',
  'ZMB',
  'ZWE',
]);

const isISO31661Alpha3 = makeRule({
  name: 'isISO31661Alpha3',
  requiresType: RequiredType.String,
  constraints: {},
  validate: value => typeof value === 'string' && ISO31661A3_CODES.has(value.toUpperCase()),
  emit: (varName: string, ctx: EmitContext): string => {
    const i = ctx.addRef(ISO31661A3_CODES);
    return `if (!refs[${i}].has(${varName}.toUpperCase())) ${ctx.fail('isISO31661Alpha3')};`;
  },
});

// Firebase Push ID — 20 chars, base64url charset (-0-9A-Za-z_)
const FIREBASE_RE = /^[a-zA-Z0-9_-]{20}$/;
const isFirebasePushId = makeStringRule(
  'isFirebasePushId',
  v => FIREBASE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(FIREBASE_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isFirebasePushId')};`;
  },
);

// SemVer — Semantic Versioning 2.0
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const isSemVer = makeStringRule(
  'isSemVer',
  v => SEMVER_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(SEMVER_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isSemVer')};`;
  },
);

// MongoDB ObjectId — 24-char hex
const MONGO_ID_RE = /^[0-9a-fA-F]{24}$/;
const isMongoId = makeStringRule(
  'isMongoId',
  v => MONGO_ID_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MONGO_ID_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isMongoId')};`;
  },
);

// DateString — ISO 8601 date only (YYYY-MM-DD) with calendar validity (day must exist in month/year).
const DATE_STRING_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function isCalendarValidDate(v: string): boolean {
  if (!DATE_STRING_RE.test(v)) {
    return false;
  }
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const maxDay = new Date(y, m, 0).getDate();
  return d >= 1 && d <= maxDay;
}

function isDateString(): EmittableRule {
  return makeStringRule('isDateString', isCalendarValidDate, (varName, ctx) => {
    const i = ctx.addRegex(DATE_STRING_RE);
    return (
      `if (!re[${i}].test(${varName})) ${ctx.fail('isDateString')};\n` +
      `else { var y=Number(${varName}.slice(0,4)),m=Number(${varName}.slice(5,7)),d=Number(${varName}.slice(8,10));` +
      `var md=new Date(y,m,0).getDate(); if(d<1||d>md)${ctx.fail('isDateString')}; }`
    );
  });
}

// ULID
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function isULID(): EmittableRule {
  return makeStringRule(
    'isULID',
    v => ULID_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(ULID_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isULID')};`;
    },
    RequiredType.String,
    { format: 'ulid' },
  );
}

// CUID2 spec: length 24-32, lowercase alphanum, starts with a-z.
const CUID2_RE = /^[a-z][0-9a-z]{23,31}$/;

function isCUID2(): EmittableRule {
  return makeStringRule(
    'isCUID2',
    v => CUID2_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(CUID2_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isCUID2')};`;
    },
    RequiredType.String,
    { format: 'cuid2' },
  );
}

export {
  isISO8601,
  isISRC,
  isISO31661Alpha2,
  isISO31661Alpha3,
  isFirebasePushId,
  isSemVer,
  isMongoId,
  isDateString,
  isULID,
  isCUID2,
};
export type { IsISO8601Options };
