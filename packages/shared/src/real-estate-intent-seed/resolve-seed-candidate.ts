import { createHash } from 'node:crypto';
import { REAL_ESTATE_INTENTS, type RealEstateIntent } from '../real-estate-intent/contracts';
import type {
  CandidateIntentResolution,
  CompiledIntentCandidate,
  DerivedIntentSupport,
} from './schemas';

type ReferenceMatch = CompiledIntentCandidate['matchedRules'][number];
type ResolutionReason = CandidateIntentResolution['reasonCodes'][number];
type CompositionType = DerivedIntentSupport['compositionType'];

export type ResolveSeedCandidateInput = Readonly<{
  normalizedText: string;
  matchedRules: readonly ReferenceMatch[];
  conflicted: boolean;
}>;

export type ResolvedSeedCandidate = Readonly<{
  mappingStatus: CompiledIntentCandidate['mappingStatus'];
  primaryIntents: readonly RealEstateIntent[];
  traceIntents: readonly RealEstateIntent[];
  derivedSupports: readonly DerivedIntentSupport[];
  intentResolutions: readonly CandidateIntentResolution[];
}>;

type Occurrence = Readonly<{ value: string; start: number; end: number }>;

const propertyTargets = [
  '酒店式公寓',
  '一居室',
  '两居室',
  '三居室',
  '写字楼',
  '老破小',
  '老房子',
  '海景房',
  '别墅',
  '二手房',
  '新房',
  '现房',
  '期房',
  '公寓',
  '住宅',
  '商铺',
  '小区',
  '楼盘',
  '房源',
  '户型',
  '公馆',
  '房子',
  '这套房',
  '那套房',
  '房',
] as const;
const searchOperators = ['哪里有', '有哪些', '怎么找', '推荐'] as const;
const priceOperators = ['多少钱', '价格', '房价'] as const;
const decisionOperators = ['值不值得买', '能买吗', '值不值', '好不好', '怎么样', '适合吗'] as const;
const financeTargets = ['公积金', '首付', '房贷', '贷款'] as const;
const financePredicates = [
  '贷款条件',
  '贷款利率',
  '能贷多少',
  '利率',
  '比例',
  '年限',
  '还款',
  '能付',
  '能不能贷款',
  '多少',
] as const;
const educationPredicates = ['为了学区', '上学', '入学', '对口', '学校', '能直接上'] as const;
const qualificationPredicates = ['能不能落户', '能否落户', '可以落户', '落户吗'] as const;
const investmentPredicates = [
  '好不好出手',
  '容易卖吗',
  '容易卖',
  '升值',
  '投资',
  '出租',
  '回报',
  '收益',
  '涨幅',
  '跌幅',
  '抄底',
] as const;
const independentConnectors = ['同时', '并且', '另外', '还要', '还想', '以及'] as const;
const nonPurchasePriceObjects = [
  '装修预算',
  '装修价格',
  '装修费',
  '停车费',
  '物业费',
  '服务费',
  '豪装',
  '精装',
  '简装',
  '装修',
  '租房',
  '租金',
  '车位',
  '户口',
  '物业',
] as const;
const nonPropertySearchObjects = [
  '装修公司',
  '租房平台',
  '租房app',
  '老业主',
  '物业',
  '优惠',
  '服务',
] as const;
const providentFundAdministration = [
  '租房提取',
  '装修提取',
  '退休提取',
  '离职提取',
  '封存提取',
  '余额怎么查',
  '提取条件',
  '每月提取',
  '一年能取',
  '多久能提取',
  '余额能全部取',
  '能取出来装修',
] as const;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const intentOrder = (left: RealEstateIntent, right: RealEstateIntent): number =>
  REAL_ESTATE_INTENTS.indexOf(left) - REAL_ESTATE_INTENTS.indexOf(right);
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareText);
const uniqueIntents = (values: readonly RealEstateIntent[]): RealEstateIntent[] =>
  [...new Set(values)].sort(intentOrder);
const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

const findOccurrences = (text: string, values: readonly string[]): Occurrence[] =>
  values
    .flatMap((value) => {
      const occurrences: Occurrence[] = [];
      let start = text.indexOf(value);
      while (start >= 0) {
        occurrences.push({ value, start, end: start + value.length });
        start = text.indexOf(value, start + 1);
      }
      return occurrences;
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.value.length - left.value.length ||
        compareText(left.value, right.value),
    );

const firstOccurrence = (text: string, values: readonly string[]): Occurrence | undefined =>
  findOccurrences(text, values)[0];

const propertyTargetOccurrences = (text: string): Occurrence[] =>
  findOccurrences(text, propertyTargets).filter(
    (occurrence) =>
      occurrence.value !== '房' ||
      (!['价', '贷', '租', '产'].includes(text.slice(occurrence.end, occurrence.end + 1)) &&
        text.slice(Math.max(0, occurrence.start - 1), occurrence.start) !== '租'),
  );

const firstPropertyTarget = (text: string): Occurrence | undefined =>
  propertyTargetOccurrences(text)[0];

const spanDistance = (left: Occurrence, right: Occurrence): number => {
  if (left.end <= right.start) return right.start - left.end;
  if (right.end <= left.start) return left.start - right.end;
  return 0;
};

const closestPropertyTarget = (
  text: string,
  operator: Occurrence | undefined,
  maximumDistance: number,
): Occurrence | undefined => {
  if (!operator) return undefined;
  return propertyTargetOccurrences(text)
    .map((target) => ({ target, distance: spanDistance(target, operator) }))
    .filter(({ distance }) => distance <= maximumDistance)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.target.start - right.target.start ||
        right.target.value.length - left.target.value.length,
    )[0]?.target;
};

const closestOccurrence = (
  text: string,
  values: readonly string[],
  operator: Occurrence | undefined,
): { occurrence: Occurrence; distance: number } | undefined => {
  if (!operator) return undefined;
  return findOccurrences(text, values)
    .map((occurrence) => ({ occurrence, distance: spanDistance(occurrence, operator) }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.occurrence.start - right.occurrence.start ||
        right.occurrence.value.length - left.occurrence.value.length,
    )[0];
};

const incompatibleObjectOwnsOperator = (
  text: string,
  operator: Occurrence | undefined,
  compatibleTarget: Occurrence | undefined,
  incompatibleObjects: readonly string[],
): boolean => {
  const incompatible = closestOccurrence(text, incompatibleObjects, operator);
  if (!incompatible) return false;
  return !compatibleTarget || incompatible.distance <= spanDistance(compatibleTarget, operator!);
};

const makeDerivedSupport = (
  normalizedText: string,
  compositionType: CompositionType,
  intent: RealEstateIntent,
  target: Occurrence,
  operator: Occurrence,
): DerivedIntentSupport => {
  const matchedSpan = {
    start: Math.min(target.start, operator.start),
    end: Math.max(target.end, operator.end),
  };
  const identity = {
    compositionType,
    intent,
    target: target.value,
    operator: operator.value,
    matchedSpan,
    normalizedText,
  };
  return {
    supportId: `dsup1_${sha256(identity)}`,
    compositionType,
    intent,
    target: target.value,
    operator: operator.value,
    matchedSpan,
  };
};

const deriveSupports = (normalizedText: string): DerivedIntentSupport[] => {
  const supports: DerivedIntentSupport[] = [];
  const financeTarget = firstOccurrence(normalizedText, financeTargets);
  const financePredicate = firstOccurrence(normalizedText, financePredicates);
  const investmentPredicate = firstOccurrence(normalizedText, investmentPredicates);
  const qualificationPredicate =
    firstOccurrence(normalizedText, qualificationPredicates) ??
    (investmentPredicate ? firstOccurrence(normalizedText, ['落户']) : undefined);
  const educationTarget = firstOccurrence(normalizedText, ['学区']);
  const educationPredicate = firstOccurrence(normalizedText, educationPredicates);
  const priceOperator = firstOccurrence(normalizedText, priceOperators);
  const searchOperator = firstOccurrence(normalizedText, searchOperators);
  const decisionOperator = firstOccurrence(normalizedText, decisionOperators);
  const canBuyOperator = firstOccurrence(normalizedText, ['能不能买']);
  const qualificationTarget = closestPropertyTarget(normalizedText, qualificationPredicate, 4);
  const investmentTarget = closestPropertyTarget(normalizedText, investmentPredicate, 6);
  const priceTarget = closestPropertyTarget(normalizedText, priceOperator, 4);
  const searchTarget = closestPropertyTarget(normalizedText, searchOperator, 4);
  const decisionTarget = closestPropertyTarget(
    normalizedText,
    decisionOperator ?? canBuyOperator,
    2,
  );
  const financeIsAdministrative = providentFundAdministration.some((phrase) =>
    normalizedText.includes(phrase),
  );
  const rentalPricePredicate =
    (normalizedText.includes('租房') ||
      normalizedText.includes('租金') ||
      normalizedText.includes('出租')) &&
    priceOperator !== undefined;
  const incompatiblePriceObject = incompatibleObjectOwnsOperator(
    normalizedText,
    priceOperator,
    priceTarget,
    nonPurchasePriceObjects,
  );
  const incompatibleSearchObject = incompatibleObjectOwnsOperator(
    normalizedText,
    searchOperator,
    searchTarget,
    nonPropertySearchObjects,
  );

  if (financeTarget && financePredicate && !financeIsAdministrative) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'FINANCE_PREDICATE_COMPOSITION',
        'FINANCIAL_PREPARATION',
        financeTarget,
        financePredicate,
      ),
    );
  }
  if (qualificationTarget && qualificationPredicate) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'QUALIFICATION_PREDICATE_COMPOSITION',
        'BUYING_QUALIFICATION',
        qualificationTarget,
        qualificationPredicate,
      ),
    );
  }
  if (educationTarget && educationPredicate) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'EDUCATION_PREDICATE_COMPOSITION',
        'EDUCATION_NEED',
        educationTarget,
        educationPredicate,
      ),
    );
  }
  if (
    investmentTarget &&
    investmentPredicate &&
    !(investmentPredicate.value === '出租' && rentalPricePredicate)
  ) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'INVESTMENT_PREDICATE_COMPOSITION',
        'INVESTMENT_INTENT',
        investmentTarget,
        investmentPredicate,
      ),
    );
  }
  if (
    priceTarget &&
    priceOperator &&
    !financeTarget &&
    !rentalPricePredicate &&
    !incompatiblePriceObject
  ) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'PRICE_TARGET_COMPOSITION',
        'PRICE_CONCERN',
        priceTarget,
        priceOperator,
      ),
    );
  }
  if (searchTarget && searchOperator && !incompatibleSearchObject) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'SEARCH_TARGET_COMPOSITION',
        'PROPERTY_SEARCH',
        searchTarget,
        searchOperator,
      ),
    );
  }
  if (decisionTarget && (decisionOperator ?? canBuyOperator)) {
    supports.push(
      makeDerivedSupport(
        normalizedText,
        'DECISION_TARGET_COMPOSITION',
        'PURCHASE_DECISION',
        decisionTarget,
        decisionOperator ?? canBuyOperator!,
      ),
    );
  }
  return [...new Map(supports.map((support) => [support.supportId, support])).values()].sort(
    (left, right) =>
      left.matchedSpan.start - right.matchedSpan.start ||
      left.matchedSpan.end - right.matchedSpan.end ||
      compareText(left.supportId, right.supportId),
  );
};

const targetOnlyRule = (rule: ReferenceMatch): boolean =>
  (rule.intent === 'PROPERTY_SEARCH' &&
    propertyTargets.some((target) => target === rule.normalizedPhrase) &&
    rule.normalizedPhrase !== '看房') ||
  (rule.intent === 'EDUCATION_NEED' && ['学区', '学区房'].includes(rule.normalizedPhrase));

const reasonOrder: readonly ResolutionReason[] = [
  'EXPLICIT_ACTION_PRIMARY',
  'QUALIFIED_PRIMARY',
  'DERIVED_PRIMARY',
  'INDEPENDENT_PRIMARY',
  'WEAK_ONLY_TRACE',
  'WEAK_ABSORBED',
  'TARGET_CONTEXT_ABSORBED',
];
const sortReasons = (reasons: readonly ResolutionReason[]): ResolutionReason[] =>
  [...new Set(reasons)].sort(
    (left, right) => reasonOrder.indexOf(left) - reasonOrder.indexOf(right),
  );

export const resolveSeedCandidate = ({
  normalizedText,
  matchedRules,
  conflicted,
}: ResolveSeedCandidateInput): ResolvedSeedCandidate => {
  const derivedSupports = deriveSupports(normalizedText);
  if (conflicted) {
    return {
      mappingStatus: 'CONFLICTED',
      primaryIntents: [],
      traceIntents: [],
      derivedSupports,
      intentResolutions: [],
    };
  }

  const rulesByIntent = new Map<RealEstateIntent, ReferenceMatch[]>();
  for (const rule of matchedRules) {
    rulesByIntent.set(rule.intent, [...(rulesByIntent.get(rule.intent) ?? []), rule]);
  }
  const derivedByIntent = new Map<RealEstateIntent, DerivedIntentSupport[]>();
  for (const support of derivedSupports) {
    derivedByIntent.set(support.intent, [...(derivedByIntent.get(support.intent) ?? []), support]);
  }

  const primary = new Set<RealEstateIntent>();
  const trace = new Set<RealEstateIntent>();
  const suppressed = new Set<RealEstateIntent>();
  for (const [intent, rules] of rulesByIntent) {
    const nonWeak = rules.filter((rule) => rule.evidenceStrength !== 'WEAK_TERM');
    const eligible = nonWeak.some((rule) => {
      if (
        intent === 'PRICE_CONCERN' &&
        priceOperators.includes(rule.normalizedPhrase as (typeof priceOperators)[number])
      ) {
        return (
          rule.normalizedPhrase === '房价' ||
          derivedSupports.some((support) => support.intent === 'PRICE_CONCERN')
        );
      }
      if (intent === 'INVESTMENT_INTENT' && rule.normalizedPhrase === '出租') {
        return !(
          (normalizedText.includes('租房') ||
            normalizedText.includes('租金') ||
            normalizedText.includes('出租')) &&
          firstOccurrence(normalizedText, priceOperators)
        );
      }
      if (
        intent === 'PROPERTY_SEARCH' &&
        (normalizedText.includes('租房') || normalizedText.includes('租金')) &&
        firstOccurrence(normalizedText, priceOperators)
      ) {
        return false;
      }
      return (
        rule.evidenceStrength !== 'EXPLICIT_ACTION' ||
        firstPropertyTarget(normalizedText) !== undefined
      );
    });
    if (eligible) primary.add(intent);
    else trace.add(intent);
  }
  for (const intent of derivedByIntent.keys()) primary.add(intent);

  const financeDerived = derivedByIntent.has('FINANCIAL_PREPARATION');
  if (financeDerived && primary.has('PRICE_CONCERN')) {
    const priceRules = rulesByIntent.get('PRICE_CONCERN') ?? [];
    if (priceRules.every((rule) => priceOperators.includes(rule.normalizedPhrase as never))) {
      primary.delete('PRICE_CONCERN');
      trace.delete('PRICE_CONCERN');
      suppressed.add('PRICE_CONCERN');
    }
  }

  const hasIndependentConnector = independentConnectors.some((connector) =>
    normalizedText.includes(connector),
  );
  if (
    !hasIndependentConnector &&
    primary.has('PURCHASE_DECISION') &&
    primary.has('INVESTMENT_INTENT') &&
    (derivedByIntent.get('PURCHASE_DECISION') ?? []).some((decision) =>
      (derivedByIntent.get('INVESTMENT_INTENT') ?? []).some(
        (investment) =>
          decision.matchedSpan.start < investment.matchedSpan.end &&
          investment.matchedSpan.start < decision.matchedSpan.end,
      ),
    )
  ) {
    primary.delete('PURCHASE_DECISION');
    trace.delete('PURCHASE_DECISION');
    suppressed.add('PURCHASE_DECISION');
  }
  if (
    !hasIndependentConnector &&
    primary.has('EDUCATION_NEED') &&
    primary.has('PURCHASE_DECISION') &&
    normalizedText.includes('为了学区')
  ) {
    primary.delete('EDUCATION_NEED');
    trace.add('EDUCATION_NEED');
  }
  const nonPropertyPrimary = [...primary].filter((intent) => intent !== 'PROPERTY_SEARCH');
  if (primary.has('PROPERTY_SEARCH') && nonPropertyPrimary.length > 0) {
    const propertyRules = rulesByIntent.get('PROPERTY_SEARCH') ?? [];
    const hasSearchDerived = derivedByIntent.has('PROPERTY_SEARCH');
    const propertyIsIndependent =
      hasSearchDerived ||
      (hasIndependentConnector && propertyRules.some((rule) => !targetOnlyRule(rule)));
    if (!propertyIsIndependent) {
      primary.delete('PROPERTY_SEARCH');
      trace.add('PROPERTY_SEARCH');
    }
  }

  const nonEducationPrimary = [...primary].filter((intent) => intent !== 'EDUCATION_NEED');
  if (primary.has('EDUCATION_NEED') && nonEducationPrimary.length > 0) {
    const educationRules = rulesByIntent.get('EDUCATION_NEED') ?? [];
    const educationIsIndependent =
      derivedByIntent.has('EDUCATION_NEED') ||
      (hasIndependentConnector && educationRules.some((rule) => !targetOnlyRule(rule)));
    if (!educationIsIndependent) {
      primary.delete('EDUCATION_NEED');
      trace.add('EDUCATION_NEED');
    }
  }

  for (const intent of primary) trace.delete(intent);
  const primaryIntents = uniqueIntents([...primary]);
  const traceIntents = uniqueIntents([...trace].filter((intent) => !suppressed.has(intent)));
  const intentResolutions: CandidateIntentResolution[] = [];
  for (const intent of primaryIntents) {
    const rules = rulesByIntent.get(intent) ?? [];
    const supports = derivedByIntent.get(intent) ?? [];
    const reasons: ResolutionReason[] = [];
    if (rules.some((rule) => rule.evidenceStrength === 'EXPLICIT_ACTION'))
      reasons.push('EXPLICIT_ACTION_PRIMARY');
    if (rules.some((rule) => rule.evidenceStrength === 'QUALIFIED_PHRASE'))
      reasons.push('QUALIFIED_PRIMARY');
    if (supports.length > 0) reasons.push('DERIVED_PRIMARY');
    if (primaryIntents.length > 1) reasons.push('INDEPENDENT_PRIMARY');
    intentResolutions.push({
      intent,
      role: 'PRIMARY',
      supportingTermIds: uniqueSorted(rules.map((rule) => rule.termId)),
      derivedSupportIds: uniqueSorted(supports.map((support) => support.supportId)),
      reasonCodes: sortReasons(reasons),
    });
  }
  for (const intent of traceIntents) {
    const rules = rulesByIntent.get(intent) ?? [];
    const reasons: ResolutionReason[] = [];
    if (rules.every((rule) => rule.evidenceStrength === 'WEAK_TERM')) {
      reasons.push(primaryIntents.length === 0 ? 'WEAK_ONLY_TRACE' : 'WEAK_ABSORBED');
    } else {
      reasons.push('TARGET_CONTEXT_ABSORBED');
    }
    intentResolutions.push({
      intent,
      role: 'TRACE',
      supportingTermIds: uniqueSorted(rules.map((rule) => rule.termId)),
      derivedSupportIds: [],
      reasonCodes: sortReasons(reasons),
    });
  }

  intentResolutions.sort(
    (left, right) =>
      (left.role === right.role ? 0 : left.role === 'PRIMARY' ? -1 : 1) ||
      intentOrder(left.intent, right.intent),
  );
  const evidenceExists = matchedRules.length > 0 || derivedSupports.length > 0;
  const mappingStatus =
    primaryIntents.length === 0
      ? evidenceExists
        ? 'AMBIGUOUS'
        : 'UNMAPPED'
      : primaryIntents.length === 1
        ? 'MAPPED'
        : 'MULTI_INTENT';
  return { mappingStatus, primaryIntents, traceIntents, derivedSupports, intentResolutions };
};
