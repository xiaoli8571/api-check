/**
 * @description UserAgentManager 类用于管理 User-Agent 和 Accept-Language 头的随机化。
 * 旨在模拟真实用户行为，避免被目标服务器识别为自动化请求。
 */
export class UserAgentManager {
    constructor() {
        /** @type {string[]} 预定义的 User-Agent 字符串列表。*/
        this.userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            'Mozilla/5.0 (Linux; Android 13; SM-S908U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        ];
        /** @type {string[]} 预定义的 Accept-Language 字符串列表。*/
        this.acceptLanguages = [
            'zh-CN,zh;q=0.9,en;q=0.8',
            'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'zh-CN,zh;q=0.9',
            'en-US,en;q=0.9',
            'en-US,en;q=0.9,es;q=0.8',
            'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'en-GB,en;q=0.9',
            'en-GB,en-US;q=0.9,en;q=0.8',
            'en-GB,en;q=0.9,fr;q=0.8',
            'en-SG,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'zh-CN,zh;q=0.9,en-SG;q=0.8,en;q=0.7',
            'en-SG,en;q=0.9,ms;q=0.8'
        ];
    }

    /**
     * @description 从预定义的 User-Agent 列表中随机获取一个。
     * @returns {string} 随机的 User-Agent 字符串。
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * @description 从预定义的 Accept-Language 列表中随机获取一个。
     * @returns {string} 随机的 Accept-Language 字符串。
     */
    getRandomAcceptLanguage() {
        return this.acceptLanguages[Math.floor(Math.random() * this.acceptLanguages.length)];
    }
}
