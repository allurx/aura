/**
 * 事件绑定工具类，支持委托绑定、直接绑定
 */
export default class EventBinderUtil {

    /**
     * 委托绑定 - 动态生成的元素
     * @param {string} delegatorSelector - 事件委托的目标选择器
     * @param {string} targetSelector - 事件目标选择器
     * @param {string} eventType - 事件类型
     * @param {Function} handler - 事件处理函数
     * @param {Object} options - 事件选项，options.stopImmediatePropagation: 是否阻止事件冒泡或捕获，同时阻止当前元素上同类型的其他监听器执行
     */
    static delegate(delegatorSelector, targetSelector, eventType, handler, options = { stopImmediatePropagation: true }) {
        document.querySelector(delegatorSelector)?.addEventListener(eventType, event => {
            const target = event.target.closest(targetSelector);
            if (target) {
                options.stopImmediatePropagation && event.stopImmediatePropagation();
                handler.call(target, target);
            }
        });
    }

    /**
     * 直接绑定 - 已存在元素
     * @param {string} targetSelector - 事件目标选择器
     * @param {string} eventType - 事件类型
     * @param {Function} handler - 事件处理函数
     * @param {Object} options - 事件选项，options.stopImmediatePropagation: 是否阻止事件冒泡或捕获，同时阻止当前元素上同类型的其他监听器执行
     */
    static bind(targetSelector, eventType, handler, options = { stopImmediatePropagation: true }) {
        document.querySelectorAll(targetSelector).forEach(element => {
            element.addEventListener(eventType, event => {
                options.stopImmediatePropagation && event.stopImmediatePropagation();
                handler.call(element, element);
            });
        });
    }
}