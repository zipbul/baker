// Directory barrel — the RAW metadata IR layer consumed by decorators and seal.
export type {
  RawClassMeta,
  RawPropertyMeta,
  RuleDef,
  TransformDef,
  ExposeDef,
  TypeDef,
  MessageArgs,
} from './types';
export { CollectionType } from './enums';
export { deleteRaw, getRaw, requireRaw, setRaw, hasRawOwn } from './meta-access';
export { ensureMeta } from './collect';
