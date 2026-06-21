// Barrel: re-exports the string-rule factories split across cohesive concern modules.
// All previously-exported value and type names resolve unchanged via `from './string'`.

export {
  minLength,
  maxLength,
  length,
  contains,
  notContains,
  matches,
  isLowercase,
  isUppercase,
  isAscii,
  isAlpha,
  isAlphanumeric,
  isHttpToken,
  isOrigin,
  isCorsOrigin,
  isBooleanString,
  isNumberString,
  isDecimal,
} from './string-basic';
export type { IsNumberStringOptions } from './string-basic';

export { isFullWidth, isHalfWidth, isVariableWidth, isMultibyte, isSurrogatePair } from './string-width';

export { isHexadecimal, isOctal, isHexColor, isRgbColor, isHSL, isBase32, isBase58, isBase64 } from './string-encoding';
export type { IsBase64Options } from './string-encoding';

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
} from './string-format';
export type { IsURLOptions, IsMACAddressOptions, IsFQDNOptions, IsStrongPasswordOptions } from './string-format';

export { isLatLong, isLatitude, isLongitude } from './string-geo';
export { isEthereumAddress, isBtcAddress, isHash } from './string-crypto';
export { isRFC3339, isMilitaryTime } from './string-datetime';

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
} from './string-identifier';
export type { IsISO8601Options } from './string-identifier';

export { isISBN, isISIN, isISSN, isEAN, isBIC, isCreditCard, isIBAN, isCurrency, isISO4217CurrencyCode } from './string-finance';
export type { IsISSNOptions, IsIBANOptions } from './string-finance';
