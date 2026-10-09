import { RESULT_CATEGORIES } from '../constants.js';

/**
 * @description 按结果标签页的展示顺序查找第一个非空分类。
 * @param {Record<string, Array<unknown>>} results - 按分类保存的结果集合。
 * @returns {string|null} - 第一个非空分类，全部为空时返回 null。
 */
export function findFirstNonEmptyCategory(results) {
    return RESULT_CATEGORIES.find(category => results[category]?.length > 0) ?? null;
}
