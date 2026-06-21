import type { EmitContext, EmittableRule } from './interfaces';

import { BakerError } from '../common';
import { TAX_ID_REGEXES } from './constants';
import { RequiredType } from './enums';
import { makeRule } from './rule-plan';
import { makeStringRule } from './string-shared';

// Email — RFC 5322 simplified
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function isEmail(): EmittableRule {
  return makeStringRule(
    'isEmail',
    v => EMAIL_RE.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(EMAIL_RE);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isEmail')};`;
    },
    RequiredType.String,
    { format: 'email' },
  );
}

// URL — RFC 3986 simplified
interface IsURLOptions {
  protocols?: string[];
}

const URL_PROTOCOLS_DEFAULT = Object.freeze(['http', 'https', 'ftp']);

function isURL(options?: IsURLOptions): EmittableRule {
  const protocols = options?.protocols ?? URL_PROTOCOLS_DEFAULT;
  const protocolPattern = protocols.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(
    `^(?:${protocolPattern}):\\/\\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)(?::(6553[0-5]|655[0-2]\\d|65[0-4]\\d{2}|6[0-4]\\d{3}|[1-5]\\d{4}|[1-9]\\d{0,3}|0))?(?:\\/[^\\s]*)?$`,
  );
  return makeRule({
    name: 'isURL',
    requiresType: RequiredType.String,
    // Copy so each rule owns an independent, mutable constraints array (the frozen default and a
    // caller-supplied array are both isolated from `rule.constraints`).
    constraints: { format: 'uri', protocols: [...protocols] },
    validate: value => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isURL')};`;
    },
  });
}

// UUID
const UUID_RE = {
  all: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  1: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-1[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  2: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-2[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  3: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-3[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  4: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  5: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-5[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
} as const;

function isUUID(version?: 1 | 2 | 3 | 4 | 5 | 'all'): EmittableRule {
  const re = version != null ? UUID_RE[version] : UUID_RE.all;
  return makeStringRule(
    'isUUID',
    v => re.test(v),
    (varName, ctx) => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isUUID')};`;
    },
    RequiredType.String,
    { format: 'uuid', version },
  );
}

// IP
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/;
const IPV6_RE =
  /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^::$|^::(?:ffff(?::0{1,4})?:)?(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){1,4}:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function isIP(version?: 4 | 6): EmittableRule {
  return makeRule({
    name: 'isIP',
    requiresType: RequiredType.String,
    constraints: { version },
    validate: value => {
      if (typeof value !== 'string') {
        return false;
      }
      if (version === 4) {
        return IPV4_RE.test(value);
      }
      if (version === 6) {
        return IPV6_RE.test(value);
      }
      return IPV4_RE.test(value) || IPV6_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (version === 4) {
        const i = ctx.addRegex(IPV4_RE);
        return `if (!re[${i}].test(${varName})) ${ctx.fail('isIP')};`;
      }
      if (version === 6) {
        const i = ctx.addRegex(IPV6_RE);
        return `if (!re[${i}].test(${varName})) ${ctx.fail('isIP')};`;
      }
      const i4 = ctx.addRegex(IPV4_RE);
      const i6 = ctx.addRegex(IPV6_RE);
      return `if (!re[${i4}].test(${varName}) && !re[${i6}].test(${varName})) ${ctx.fail('isIP')};`;
    },
  });
}

// MAC Address
interface IsMACAddressOptions {
  noSeparators?: boolean;
}

const MAC_COLON_RE = /^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}$/;
const MAC_HYPHEN_RE = /^[0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5}$/;
const MAC_NO_SEP_RE = /^[0-9a-fA-F]{12}$/;

function isMACAddress(options?: IsMACAddressOptions): EmittableRule {
  const noSeparators = options?.noSeparators ?? false;
  return makeRule({
    name: 'isMACAddress',
    requiresType: RequiredType.String,
    constraints: { noSeparators },
    validate: value => {
      if (typeof value !== 'string') {
        return false;
      }
      if (noSeparators) {
        return MAC_NO_SEP_RE.test(value);
      }
      return MAC_COLON_RE.test(value) || MAC_HYPHEN_RE.test(value);
    },
    emit: (varName: string, ctx: EmitContext): string => {
      if (noSeparators) {
        const i = ctx.addRegex(MAC_NO_SEP_RE);
        return `if (!re[${i}].test(${varName})) ${ctx.fail('isMACAddress')};`;
      }
      const i1 = ctx.addRegex(MAC_COLON_RE);
      const i2 = ctx.addRegex(MAC_HYPHEN_RE);
      return `if (!re[${i1}].test(${varName}) && !re[${i2}].test(${varName})) ${ctx.fail('isMACAddress')};`;
    },
  });
}

// JWT — 3-part dot-separated base64url
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const isJWT = makeStringRule(
  'isJWT',
  v => JWT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(JWT_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isJWT')};`;
  },
);

// Locale — BCP 47 simplified. Variant subtags are `5*8alphanum` OR a digit followed by 3 alphanum
// (e.g. the `1996` orthography variant in `de-DE-1996`).
const LOCALE_RE = /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|\d{3}))?(?:-(?:[a-zA-Z\d]{5,8}|\d[a-zA-Z\d]{3}))*$/;
const isLocale = makeStringRule(
  'isLocale',
  v => LOCALE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(LOCALE_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isLocale')};`;
  },
);

// DataURI
const DATA_URI_RE = /^data:([a-zA-Z0-9!#$&\-^_]+\/[a-zA-Z0-9!#$&\-^_]+)(?:;[a-zA-Z0-9-]+=[a-zA-Z0-9-]+)*(?:;base64)?,[\s\S]*$/;
const isDataURI = makeStringRule(
  'isDataURI',
  v => DATA_URI_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(DATA_URI_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isDataURI')};`;
  },
);

// FQDN
interface IsFQDNOptions {
  requireTld?: boolean;
  allowUnderscores?: boolean;
  allowTrailingDot?: boolean;
}

function isFQDN(options?: IsFQDNOptions): EmittableRule {
  const requireTld = options?.requireTld !== false;
  const allowUnderscores = options?.allowUnderscores ?? false;
  const allowTrailingDot = options?.allowTrailingDot ?? false;

  const partRe = allowUnderscores ? /^[a-zA-Z0-9_-]+$/ : /^[a-zA-Z0-9-]+$/;

  const validateFqdn = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false;
    }
    let str = value;
    if (allowTrailingDot && str.endsWith('.')) {
      str = str.slice(0, -1);
    }
    if (str.length === 0) {
      return false;
    }
    const parts = str.split('.');
    if (requireTld && parts.length < 2) {
      return false;
    }
    if (requireTld) {
      const tld = parts[parts.length - 1];
      // `/^[a-zA-Z]{2,}$/` already rejects anything shorter than 2; `!tld` narrows the `string | undefined` index.
      if (!tld || !/^[a-zA-Z]{2,}$/.test(tld)) {
        return false;
      }
    }
    return parts.every(part => {
      if (part.length === 0 || part.length > 63) {
        return false;
      }
      if (!partRe.test(part)) {
        return false;
      }
      if (!allowUnderscores && (part.startsWith('-') || part.endsWith('-'))) {
        return false;
      }
      return true;
    });
  };

  return makeRule({
    name: 'isFQDN',
    requiresType: RequiredType.String,
    constraints: { requireTld, allowUnderscores, allowTrailingDot },
    validate: validateFqdn,
    emit: (varName: string, ctx: EmitContext): string => {
      const ri = ctx.addRegex(partRe);
      const tldRi = requireTld ? ctx.addRegex(/^[a-zA-Z]{2,}$/) : -1;
      // Inline for-loop instead of fp.every(function(p){...}) — avoids per-call closure
      // allocation inside the JIT executor.
      const partCheck =
        `if(p.length===0||p.length>63){fqOk=false;break;}` +
        `if(!re[${ri}].test(p)){fqOk=false;break;}` +
        (allowUnderscores ? '' : `if(p[0]==='-'||p[p.length-1]==='-'){fqOk=false;break;}`);
      const loopBlock = `var fqOk=true;for(var fi=0;fi<fp.length;fi++){var p=fp[fi];${partCheck}}if(!fqOk)${ctx.fail('isFQDN')};`;
      let code = `{var fq=${varName};`;
      if (allowTrailingDot) {
        code += `if(fq.endsWith('.'))fq=fq.slice(0,-1);`;
      }
      code += `if(fq.length===0)${ctx.fail('isFQDN')};`;
      code += `else{var fp=fq.split('.');`;
      if (requireTld) {
        code += `if(fp.length<2)${ctx.fail('isFQDN')};`;
        code += `else{var tld=fp[fp.length-1];`;
        code += `if(!tld||!re[${tldRi}].test(tld))${ctx.fail('isFQDN')};`;
        code += `else{${loopBlock}}`; // close tld inner else block
        code += '}'; // close tld outer else block
      } else {
        code += loopBlock;
      }
      code += '}'; // close split else{
      code += '}'; // close outer {
      return code;
    },
  });
}

// Port — 0 to 65535
const PORT_RE = /^(?:6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{1,3}|\d)$/;
const isPort = makeStringRule(
  'isPort',
  v => PORT_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(PORT_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isPort')};`;
  },
);

// JSON
const validateJsonString = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const isJSON = makeRule({
  name: 'isJSON',
  requiresType: RequiredType.String,
  constraints: {},
  validate: validateJsonString,
  emit: (varName: string, ctx: EmitContext): string => `try { JSON.parse(${varName}); } catch { ${ctx.fail('isJSON')}; }`,
});

// MimeType
const MIME_TYPE_RE =
  /^(application|audio|font|image|message|model|multipart|text|video)\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*(?:;.+)?$/;
const isMimeType = makeStringRule(
  'isMimeType',
  v => MIME_TYPE_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MIME_TYPE_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isMimeType')};`;
  },
);

// Magnet URI
const MAGNET_URI_RE = /^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,40}(?:&[a-z][a-z0-9.]*=[^&\s]*)*$/i;
const isMagnetURI = makeStringRule(
  'isMagnetURI',
  v => MAGNET_URI_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(MAGNET_URI_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isMagnetURI')};`;
  },
);

// ByteLength — counts UTF-8 bytes via Buffer.byteLength
function isByteLength(min: number, max?: number): EmittableRule {
  const validateByteLength = (value: unknown): boolean => {
    if (typeof value !== 'string') {
      return false;
    }
    const byteLen = Buffer.byteLength(value, 'utf8');
    if (byteLen < min) {
      return false;
    }
    if (max !== undefined && byteLen > max) {
      return false;
    }
    return true;
  };
  return makeRule({
    name: 'isByteLength',
    requiresType: RequiredType.String,
    constraints: { min, max },
    validate: validateByteLength,
    emit: (varName: string, ctx: EmitContext): string => {
      let code = `{var bl=Buffer.byteLength(${varName},'utf8');`;
      code += `if(bl<${min})${ctx.fail('isByteLength')};`;
      if (max !== undefined) {
        code += `else if(bl>${max})${ctx.fail('isByteLength')};`;
      }
      code += '}';
      return code;
    },
  });
}

// isPhoneNumber — E.164 international phone number

const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;

const isPhoneNumber = makeStringRule(
  'isPhoneNumber',
  v => PHONE_E164_RE.test(v),
  (varName, ctx) => {
    const i = ctx.addRegex(PHONE_E164_RE);
    return `if (!re[${i}].test(${varName})) ${ctx.fail('isPhoneNumber')};`;
  },
);

// isStrongPassword — strong password check (factory)

interface IsStrongPasswordOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
}

function isStrongPassword(options?: IsStrongPasswordOptions): EmittableRule {
  const minLength = options?.minLength ?? 8;
  const minLower = options?.minLowercase ?? 1;
  const minUpper = options?.minUppercase ?? 1;
  const minNums = options?.minNumbers ?? 1;
  const minSymbols = options?.minSymbols ?? 1;

  // Single-pass character classification — counts all categories in one scan.
  // Replaces 4× v.match(/.../g) which allocates 4 result arrays per call.
  const validate = (v: string): boolean => {
    if (v.length < minLength) {
      return false;
    }
    let lower = 0;
    let upper = 0;
    let nums = 0;
    let symbols = 0;
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i);
      if (c >= 97 && c <= 122) {
        lower++;
      } else if (c >= 65 && c <= 90) {
        upper++;
      } else if (c >= 48 && c <= 57) {
        nums++;
      } else {
        symbols++;
      }
    }
    return lower >= minLower && upper >= minUpper && nums >= minNums && symbols >= minSymbols;
  };

  return makeRule({
    name: 'isStrongPassword',
    requiresType: RequiredType.String,
    constraints: {},
    validate: value => typeof value === 'string' && validate(value),
    emit: (varName: string, ctx: EmitContext): string => {
      // Inline single-pass scan in the JIT executor — no regex match[] allocations
      const failExpr = ctx.fail('isStrongPassword');
      const checks: string[] = [];
      if (minLower > 0) {
        checks.push(`spLo<${minLower}`);
      }
      if (minUpper > 0) {
        checks.push(`spUp<${minUpper}`);
      }
      if (minNums > 0) {
        checks.push(`spNum<${minNums}`);
      }
      if (minSymbols > 0) {
        checks.push(`spSym<${minSymbols}`);
      }
      const guard = checks.length === 0 ? '' : `if(${checks.join('||')}){${failExpr}}`;
      return (
        `if(${varName}.length<${minLength}){${failExpr}}else{` +
        `var spLo=0,spUp=0,spNum=0,spSym=0;` +
        `for(var spI=0;spI<${varName}.length;spI++){var spC=${varName}.charCodeAt(spI);` +
        `if(spC>=97&&spC<=122)spLo++;else if(spC>=65&&spC<=90)spUp++;else if(spC>=48&&spC<=57)spNum++;else spSym++;}` +
        guard +
        `}`
      );
    },
  });
}

// isTaxId — locale-specific tax identifier (factory)

function isTaxId(locale: string): EmittableRule {
  const re = TAX_ID_REGEXES[locale];
  if (!re) {
    throw new BakerError(`Unsupported locale: "${locale}" for isTaxId`);
  }
  return makeRule({
    name: 'isTaxId',
    requiresType: RequiredType.String,
    constraints: { locale },
    validate: value => typeof value === 'string' && re.test(value),
    emit: (varName: string, ctx: EmitContext): string => {
      const i = ctx.addRegex(re);
      return `if (!re[${i}].test(${varName})) ${ctx.fail('isTaxId')};`;
    },
  });
}

export {
  isEmail,
  isURL,
  isUUID,
  isIP,
  isMACAddress,
  isJWT,
  isLocale,
  isDataURI,
  isFQDN,
  isPort,
  isJSON,
  isMimeType,
  isMagnetURI,
  isByteLength,
  isPhoneNumber,
  isStrongPassword,
  isTaxId,
};
export type { IsURLOptions, IsMACAddressOptions, IsFQDNOptions, IsStrongPasswordOptions };
