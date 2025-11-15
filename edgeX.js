/**
 * Twitter: 多啦幣夢 - https://x.com/ken1494048
 * Below is the reference to the original source code
 * Feel free to also follow him
 **/

/**
推特：观海bit - https://x.com/guanhaibit
TG：观海bit - https://t.co/KOThlkKZsq
脚本介绍：
这是一个纯前端的 edgex 自动化刷量的脚本，帮助大家减少手动操作刷前 100w 交易量，同时手续费和磨损非常低。
改进：添加波动率检查，防止价格剧烈波动时下单导致额外损失。需配置价格选择器。
核心策略：中间价挂限价单，再实时监控是否存在订单，如果有则市价平仓；
实测 100w 交易，损耗：270u左右；
操作流程：
1. 打开 edgex 交易页面：https://pro.edgex.exchange/trade/BTCUSDT
2. 在购买数量的里，写入你想单笔刷量的数量，我一般写个0.005；
3. 打开 Chrome 控制台，把下面👇脚本代码粘贴进去，敲回车
**/
let groupOpen = {};

const log = (module, level = "info", msg) => {
    const ts = new Date().toLocaleTimeString().slice(0, 8);
    const icons = {
        info: "Check",
        warn: "Warning",
        error: "Cross",
        close: "Close",
        order: "Arrow Up",
        vol: "Wave",
        safety: "Shield",
    };
    const colors = {
        info: "#4CAF50",
        warn: "#FF9800",
        error: "#F44336",
        close: "#2196F3",
        order: "#9C27B0",
        vol: "#00BCD4",
        safety: "#FF5722",
    };

    const key = module.toUpperCase();
    const icon = icons[level] || "Circle";
    const color = colors[level] || "#888";

    // Auto-open group on first log
    if (!groupOpen[key]) {
        console.groupCollapsed(
            `%c${icon} [${key}]`,
            `color:${color}; font-weight:bold;`
        );
        groupOpen[key] = true;
    }

    console.log(`%c${ts} | ${msg}`, `color:${color}; font-size:11px;`);
};

// Source - https://stackoverflow.com/a
// Posted by user2927940, modified by community. See post 'Timeline' for change history
// Retrieved 2025-11-15, License - CC BY-SA 3.0

function getHtmlTextContain(_ele, _text) {
    return Array.from(document.querySelectorAll(_ele)).find(
        (el) => el.textContent === _text
    );
}

function regExContains(selector, text) {
    var elements = document.querySelectorAll(selector);
    return Array.prototype.filter.call(elements, function (element) {
        return RegExp(text).test(element.textContent);
    });
}

function trustedClick(element) {
    if (!element) return;

    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(type => {
        const event = new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        });
        element.dispatchEvent(event);
    });
}

function setReactInputValue(input, value) {
    if (!input) return false;

    // 1. Focus and select
    input.focus();
    input.select();

    // 2. Set value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    ).set;

    nativeInputValueSetter.call(input, value);

    // 3. Dispatch full event chain
    const events = [
        'input',
        'change',
        'keydown',
        'keyup',
        'blur'
    ];

    events.forEach(type => {
        const event = new Event(type, { bubbles: true });
        if (type === 'keydown' || type === 'keyup') {
            Object.defineProperty(event, 'key', { value: 'Enter' });
        }
        input.dispatchEvent(event);
    });

    // 4. Trigger React's internal update
    const reactProps = Object.keys(input).find(key => key.startsWith('__reactProps'));
    if (reactProps && input[reactProps]?.onChange) {
        input[reactProps].onChange({ target: input });
    }

    console.log(`[Input] Set to ${value}`);
    return true;
}

const priceSelector =
    "#root > div.flex-1.flex.flex-col > div.min-h-\\[calc\\(100vh-98px\\)\\].flex.flex-col.bg-fill-page-primary > div > div.flex-1.flex.flex-col.gap-\\[3px\\].bg-fill-page-tertiary.min-w-0 > div.flex.gap-\\[3px\\].relative.min-w-0 > div.flex.flex-col.gap-\\[3px\\].flex-1.min-w-0.h-full.overflow-hidden > div.trade-card.h-\\[64px\\].flex.items-center.text-xs.px-2.gap-2.flex-shrink-0.overflow-hidden.w-full.max-w-full > div.relative.flex-1.h-full.overflow-x-auto.flex.flex-wrap.w-0 > div.flex-1.overflow-auto.no-scrollbar.flex.items-center.gap-8.h-full.tabular-nums > div.shrink-0.text-xs.\\[\\&\\>\\.view-item-value\\]\\:text-xs.whitespace-nowrap.\\[\\&\\>\\.view-item-value\\]\\:whitespace-nowrap.cursor-help > div.view-item-value.mt-1";
const volThreshold = 0.05; // 波动率阈值（%），超过则暂停下单。BTC建议0.1-0.5，根据测试调整。
const priceHistorySize = 10; // 监控最近多少个价格点计算波动率。
const minDelay = 3000; // 最小随机延迟 (ms)
const maxDelay = 10000; // 最大随机延迟 (ms)

// 启动下单模块（首次随机延迟后开始）
const firstDelay = getRandomDelay();
// Run every 10 seconds
let cancellingOrder = false
/**
 * Checks account balance every 10 seconds
 * Stops the entire script if loss > threshold
 */
let initialBalance = null;
const lossThreshold = 200; // Max allowed loss in USDT

// ============ 模块0：价格监控 & 波动率计算 ============
let prices = [];
const priceInterval = setInterval(() => {
    try {
        const priceElem = document
            .getElementsByClassName("trade-card")[1]
            .querySelector(":scope > div:nth-child(2)");
        if (priceElem) {
            const priceText = priceElem.textContent.trim().replace(/,/g, "");
            const price = parseFloat(priceText);
            if (!isNaN(price)) {
                prices.push(price);
                if (prices.length > priceHistorySize) prices.shift();
            }
        } else {
            log("价格", "warn", "未找到价格元素，请检查 priceSelector");
        }
    } catch (error) {
        log("价格", "error", `获取价格出错: ${error}`);
    }
}, 1000);

function getVolatility() {
    if (prices.length < priceHistorySize) {
        return 0;
    }
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance =
        prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volPercent = (stdDev / mean) * 100;
    log("波动", "info", `当前波动率: ${volPercent.toFixed(2)}%`);
    return volPercent;
}

// ============ 模块1：市价平仓模块 ============
let isClosingPosition = false;
const closePositionInterval = setInterval(() => {
    try {
        const oneClickmarketCloseBtn = getHtmlTextContain("button", "全部平倉");
        if (cancellingOrder || isClosingPosition || oneClickmarketCloseBtn.disabled) {
            return;
        }

        if (
            oneClickmarketCloseBtn &&
            oneClickmarketCloseBtn.textContent.trim() === "全部平倉"
        ) {
            log("平仓", "info", "找到一鍵市价按钮，正在点击...");

            isClosingPosition = true;
            oneClickmarketCloseBtn.click();

            // 点击确认按钮
            setTimeout(() => {
                try {
                    const confirmButton = getHtmlTextContain("button", "確認");
                    if (confirmButton) {
                        confirmButton.click();
                        log("平仓", "info", "完成：市价 → 确认");
                    } else {
                        log("平仓", "warn", "未找到确认按钮");
                    }
                } catch (error) {
                    log("平仓", "error", `点击确认按钮时出错: ${error}`);
                } finally {
                    // 等待1秒后解锁
                    setTimeout(() => {
                        isClosingPosition = false;
                    }, 2000);
                }
            }, 600);

            // 超时保护
            setTimeout(() => {
                log("平仓", "warn", `操作超时，强制解锁`);
                isClosingPosition = false;
            }, 5000);
        } else {
            log("平仓", "error", `找不到一鍵市价按钮`);
        }
    } catch (error) {
        log("平仓", "error", `脚本执行出错: ${error}`);
        isClosingPosition = false;
    }
}, 300); // 改进：加快到300ms，更快平仓

// ============ 模块2：下单模块 ============
let isPlacingOrder = false;
// 生成随机延迟时间
function getRandomDelay() {
    return Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
}
function placeOrder() {
    if (isPlacingOrder || cancellingOrder) {
        return;
    }

    // 改进：检查波动率
    const vol = getVolatility();
    if (vol > volThreshold) {
        log(
            "下单",
            "warn",
            `波动率 ${vol.toFixed(2)}% > ${volThreshold}%，跳过本次下单`
        );
        const randomDelay = getRandomDelay();
        setTimeout(placeOrder, randomDelay);
        return;
    }

    isPlacingOrder = true;

    try {
        // 1. 点击设置价格按钮
        const priceButton = getHtmlTextContain("div", "中間價");
        if (priceButton) {
            priceButton.click();

            // 2. 等待300ms后，点击下单按钮
            setTimeout(() => {
                try {
                    const orderButton = getHtmlTextContain("div", "買入 / 做多");
                    if (orderButton) {
                        orderButton.click();
                        log("下单", "info", "完成：设置价格 → 下单");
                    } else {
                        log("下单", "warn", "未找到下单按钮");
                    }
                } catch (error) {
                    log("下单", "error", `点击下单按钮时出错: ${error}`);
                } finally {
                    isPlacingOrder = false;

                    // 随机延迟后进行下一次下单
                    const randomDelay = getRandomDelay();
                    log(
                        "下单",
                        "info",
                        `随机等待 ${(randomDelay / 1000).toFixed(1)}秒 后进行下一次下单...`
                    );
                    setTimeout(placeOrder, randomDelay);
                }
            }, 300);
        } else {
            log("下单", "warn", `未找到设置价格按钮`);
            isPlacingOrder = false;

            // 失败了也继续下一轮
            const randomDelay = getRandomDelay();
            setTimeout(placeOrder, randomDelay);
        }
    } catch (error) {
        log("下单", "error", `脚本执行出错: ${error}`);
        isPlacingOrder = false;

        // 出错也继续下一轮
        const randomDelay = getRandomDelay();
        setTimeout(placeOrder, randomDelay);
    }
}
function checkAccountLoss() {
    try {
        const balanceEl = getHtmlTextContain(
            "label",
            "總資產"
        ).parentElement.querySelector("output");

        if (!balanceEl) return;

        const currentAmount = parseInt(
            balanceEl.textContent.split(" ")[0].replaceAll(",", "")
        );
        if (isNaN(currentAmount)) return;

        if (initialBalance === null) {
            initialBalance = currentAmount;
            log("餘額", "info", `初始餘額: ${initialBalance} USDT`);
            return;
        }
        log("餘額", "info", `現在餘額: ${currentAmount} USDT`);

        const loss = Math.abs(initialBalance - currentAmount);
        if (loss > lossThreshold) {
            log(
                "餘額",
                "error",
                `Loss ${loss} USDT > ${lossThreshold} → Script stopped`
            );
            clearInterval(priceInterval);
            clearInterval(closePositionInterval);
            clearInterval(lossCheckInterval);
            return;
        }
    } catch (e) {
        log("餘額", "error", `Error: ${e}`);
    }
}

setTimeout(placeOrder, firstDelay);

// Run every 10 seconds
const lossCheckInterval = setInterval(checkAccountLoss, 10000);

const cancelAllOrders = setInterval(function () {
    const orderSizeEle = document.querySelector("#orderSizeValue");
    if (orderSizeEle.value !== '0.005') {
        setReactInputValue(orderSizeEle, '0.005')
    }
    if (orderSizeEle.value === '0' && !cancellingOrder) {
        cancellingOrder = true;
        const currentOrderBtn = regExContains('button', '當前委託')[0];

        trustedClick(currentOrderBtn)
        setTimeout(function () {
            const cancelAllBtn = getHtmlTextContain('button', '全部取消');
            trustedClick(cancelAllBtn)

            setTimeout(function () {
                const confirmButton = getHtmlTextContain("button", "確認");
                trustedClick(confirmButton)

                setTimeout(function () {
                    trustedClick(getHtmlTextContain('button', '持倉'))

                    setReactInputValue(orderSizeEle, '0.005')
                    cancellingOrder = false
                }, 1500)
            }, 1000)
        }, 500)
    }
}, 10000)

// ============ 控制面板 ============
console.log("🛑 停止价格监控: clearInterval(" + priceInterval + ")");
console.log("🛑 停止平仓模块: clearInterval(" + closePositionInterval + ")");
console.log("🛑 停止餘額模块: clearInterval(" + lossCheckInterval + ")");
// log("下单", "info", `${(firstDelay / 1000).toFixed(1)}秒 后开始首次下单...`);
