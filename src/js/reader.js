/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Aura from "./aura.js";
import FullscreenUtil from "./util/fullscreenUtil.js";
import ReadingProgress from "./model/readingProgress.js";

class Reader {

    // 当前书籍信息
    book;

    // 目录
    toc;

    // 当前阅读进度
    readingProgress;

    // 当前阅读设置
    setting;

    // 初始化阅读器
    async init(bookId) {
        if (bookId) {
            console.log("已从sessionStorage读取到bookId:", bookId);
            await Promise.all([
                Aura.database.getByKey(Aura.databaseProperties.stores.book.name, bookId).then(book => this.book = book),
                Aura.database.getByKey(Aura.databaseProperties.stores.tableOfContents.name, bookId).then(toc => this.toc = toc.contents),
                Aura.database.getByKey(Aura.databaseProperties.stores.readingProgress.name, bookId).then(readingProgress => this.readingProgress = readingProgress),
                Aura.database.getByKey(Aura.databaseProperties.stores.setting.name, "reader-setting").then(setting => this.readerSetting = setting || Aura.reader.setting)
            ]).then(() => {
                this.renderChapter();
                this.applyTheme(this.readerSetting.theme);
                this.applyFontSize(this.readerSetting.fontSize);
                this.applyPageWidth(this.readerSetting.pageWidth);
                this.applyPagePadding(this.readerSetting.pagePadding);
                this.applyLineHeight(this.readerSetting.lineHeight);
                this.applyFontColor(this.readerSetting.fontColor);
                this.applyContentBackgroundColor(this.readerSetting.contentBackgroundColor);
                this.applyBackgroundColor(this.readerSetting.backgroundColor);
                this.bindEvent();
                this.loadChapter(this.readingProgress);
                this.showReader();
            });
        } else {
            console.log("未从sessionStorage读取到bookId");
            window.location.href = "/";
        }
    }

    // 通过css动画，防止页面频繁加载时元素闪烁
    showReader() {
        document.getElementById("reader").classList.add("visible");
    }

    // 渲染章节列表
    renderChapter() {
        const container = document.getElementById("chapter-list");
        container.innerHTML = "";

        // 创建文档片段，避免多次dom操作
        const fragment = document.createDocumentFragment();

        this.toc.forEach(chapter => {
            const p = document.createElement("p");
            p.textContent = chapter.title;
            p.dataset.index = chapter.id;
            fragment.appendChild(p);
        });

        // 一次性添加到容器
        container.appendChild(fragment);

        // 使用事件委托绑定click，避免大量事件监听器
        container.addEventListener("click", (event) => {

            // 判断点击的是否是 <p> 元素
            const p = event.target.closest("p");

            if (p && container.contains(p)) this.loadChapter(new ReadingProgress(this.readingProgress.bookId, Number(p.dataset.index), 0, 0));

        });
    }

    // 显示或隐藏加载动画
    showLoading(show) {
        return document.getElementById("loading-overlay").hidden = !show;
    }

    // 加载章节内容
    async loadChapter(readingProgress) {
        this.showLoading(true);
        await Aura.database.getByKey(Aura.databaseProperties.stores.chapter.name, [readingProgress.bookId, readingProgress.chapterId])
            .then(async chapter => {

                console.log("当前阅读进度: ", readingProgress);

                // 创建内容行元素
                const contentElement = document.getElementById("content");
                contentElement.innerHTML = "";
                const fragment = document.createDocumentFragment();
                chapter.content.split(/\r?\n/).forEach((line, index) => {
                    const p = document.createElement("p");
                    p.dataset.index = index;
                    p.textContent = line;
                    fragment.appendChild(p);
                });
                contentElement.appendChild(fragment);

                // 先滚动到之前阅读的行
                contentElement.querySelector(`p[data-index="${readingProgress.lineIndex}"]`)?.scrollIntoView({ block: "start", behavior: "auto" });
                // 微调scrollTop，兼顾移动端弹性滚动
                const scrollAdjustment = readingProgress.scrollTop ? readingProgress.scrollTop - contentElement.scrollTop : 0;
                contentElement.scrollTop += scrollAdjustment;

                // 更新章节名称
                const chapterElement = document.getElementById("chapter-name");
                chapterElement.textContent = chapter.title;

                // 更新阅读进度
                this.readingProgress = readingProgress
                await Aura.database.put(Aura.databaseProperties.stores.readingProgress.name, this.readingProgress);
            })
            .then(() => this.highlightChapter())
            .then(() => this.renderProgress())
            .finally(() => this.showLoading(false));

    }

    // 渲染章节阅读进度
    renderProgress() {
        const rate = (((this.readingProgress.chapterId + 1) / this.toc.length) * 100).toFixed(2);
        document.getElementById("progress-rate").textContent = `${rate}%`;
    }

    // 高亮当前章节
    highlightChapter() {

        // 移除之前的章节高亮
        document.querySelector("#chapter-list p.active")?.classList.remove("active");

        // 高亮当前章节
        const currentChapterElement = document.querySelector(`#chapter-list p[data-index="${this.readingProgress.chapterId}"]`);
        currentChapterElement.classList.add("active");

        // 滚动到当前章节
        currentChapterElement.scrollIntoView({ behavior: "smooth", block: "start" });

    }

    // 绑定事件
    bindEvent() {

        // 展开/关闭章节面板
        document.getElementById("toggle-chapter-panel").onclick = () => {
            const chapterPanel = document.getElementById("chapter-panel");
            chapterPanel.hidden = !chapterPanel.hidden;
            this.highlightChapter();
        }

        // 关闭章节面板
        document.getElementById("close-chapter-panel-btn").addEventListener("click", () => {
            document.getElementById("chapter-panel").hidden = true;
        });

        // 切换全屏
        document.getElementById("toggle-fullscreen").addEventListener("click", async () => {
            await FullscreenUtil.toggle(document.documentElement).catch(error => alert(error.message));
        });

        // 展开/关闭设置面板
        document.getElementById("toggle-setting-panel").addEventListener("click", () => {
            const settingPanel = document.getElementById("setting-panel");
            settingPanel.hidden = !settingPanel.hidden;
        });

        // 关闭设置面板
        document.getElementById("close-setting-panel-btn").addEventListener("click", () =>
            document.getElementById("setting-panel").hidden = true);

        // 重置设置面板
        document.getElementById("reset-setting-panel-btn").onclick = () => {
            this.applyTheme(Aura.reader.setting.theme);
            this.applyFontSize(Aura.reader.setting.fontSize);
            this.applyPageWidth(Aura.reader.setting.pageWidth);
            this.applyPagePadding(Aura.reader.setting.pagePadding);
            this.applyLineHeight(Aura.reader.setting.lineHeight);
            this.applyFontColor(Aura.reader.setting.fontColor);
            this.applyContentBackgroundColor(Aura.reader.setting.contentBackgroundColor);
            this.applyBackgroundColor(Aura.reader.setting.backgroundColor);
            this.saveReaderSetting(Aura.reader.setting);
        }

        // 主题切换
        document.getElementById("theme").addEventListener("change", (event) => {
            this.applyTheme(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, theme: event.target.value, ...Aura.reader.theme[event.target.value] });
        });

        // 正文字体调整
        document.getElementById("font-size").addEventListener("input", (event) => {
            this.applyFontSize(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, fontSize: event.target.value });
        });

        // 正文页面宽度调整
        document.getElementById("width").addEventListener("input", (event) => {
            this.applyPageWidth(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, pageWidth: event.target.value });
        });

        // 正文页面内边距调整
        document.getElementById("padding").addEventListener("input", (event) => {
            this.applyPagePadding(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, pagePadding: event.target.value });
        });

        // 正文行高调整
        document.getElementById("line-height").addEventListener("input", (event) => {
            this.applyLineHeight(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, lineHeight: event.target.value });
        });

        // 字体颜色调整
        document.getElementById("font-color").addEventListener("input", (event) => {
            this.applyFontColor(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, fontColor: event.target.value });
        });

        // 正文背景色设置
        document.getElementById("content-background-color").addEventListener("input", (event) => {
            this.applyContentBackgroundColor(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, contentBackgroundColor: event.target.value });
        });

        // 网页背景色设置
        document.getElementById("background-color").addEventListener("input", (event) => {
            this.applyBackgroundColor(event.target.value);
            this.saveReaderSetting({ ...this.readerSetting, backgroundColor: event.target.value });
        });

        // 实时计算当前章节最上方可见的<p>元素（可见比例超过一半才算，带防抖）
        document.getElementById("content").addEventListener("scroll", (() => {

            // 用于防抖控制
            let timer;

            return (event) => {

                // 清除上一次定时
                clearTimeout(timer);

                // 计算当前章节最上方可见的<p>元素
                timer = setTimeout(async () => {

                    // 滚动容器可视区域
                    const cRect = event.target.getBoundingClientRect();
                    const line = [...event.target.querySelectorAll("p")]
                        .filter(p => {

                            // p可视区域
                            const rect = p.getBoundingClientRect();

                            // 可见高度 = 元素与容器可视区域的交集高度
                            const visibleHeight = Math.min(rect.bottom, cRect.bottom) - Math.max(rect.top, cRect.top);

                            // 超过一半才算可见
                            return visibleHeight > rect.height / 2;
                        })
                        // 按top排序，取最上方
                        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
                        || null;

                    console.log("当前章节最上方可见的行：", line);

                    if (line) {
                        const lineData = new ReadingProgress(this.book.id, this.readingProgress.chapterId, Number(line.dataset.index), event.target.scrollTop);
                        await Aura.database.put(Aura.databaseProperties.stores.readingProgress.name, lineData);
                    }

                    //防抖延迟时间（毫秒）
                }, 200);
            };

        })());

        // 监听reader的resize事件，保存页宽
        new ResizeObserver(
            (() => {

                // 用于防抖控制
                let timer;

                return entries => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {

                        // 当前reader的宽度
                        const newWidth = entries[0].contentRect.width;

                        // 计算应用的新宽度，取屏幕宽度和新宽度的最小值
                        const appliedWidth = Math.min(Math.round(newWidth), window.screen.width);

                        console.log("检测到页面宽度变化：", newWidth);

                        // 应用新宽度
                        this.applyPageWidth(appliedWidth);

                        // 保存页面宽度
                        this.saveReaderSetting({ ...this.readerSetting, pageWidth: appliedWidth });
                    }

                        //防抖延迟时间（毫秒）
                        , 200);
                };
            })()
        ).observe(document.getElementById("reader"));

        // 监听页面点击事件，判断是否需要切换章节
        ((reader) => {

            // 点击和滑动阈值
            const clickAndSwipeThreshold = 8;

            // 最小滑动角度阈值（度）- 确保是水平滑动
            const minSwipeAngle = 30

            // 追踪触摸状态
            let isTouching = false;

            // 追踪指针信息
            const pointer = {
                // 指针移动轨迹相对于x轴的角度
                angle: 0,
                // 指针类型 - mouse | touch
                type: null,
                // 指针事件动作 - mouse click | touch click | touch horizontal swipe | touch vertical swipe
                action: null,
                // 指针事件结束原因 - pointerup | pointercancel
                endCause: null,
                startX: 0,
                startY: 0,
                lastX: 0,
                lastY: 0,
                // 指针在x轴上的移动距离
                deltaX: 0,
                // 指针在y轴上的移动距离
                deltaY: 0,
                // 指针事件开始目标
                startTarget: null,
                // 指针事件结束目标
                endTarget: null,
            }

            // 内容区域
            const content = document.getElementById("content");

            // 记录触摸起始位置
            document.addEventListener("pointerdown", event => {
                pointer.type = event.pointerType;
                pointer.startTarget = event.target;
                pointer.endTarget = pointer.startTarget;
                pointer.startX = event.clientX;
                pointer.startY = event.clientY;
                pointer.lastX = pointer.startX;
                pointer.lastY = pointer.startY;
                pointer.deltaX = 0;
                pointer.deltaY = 0;
                if (event.pointerType === "touch") isTouching = true;
            });

            // 监听pointermove事件，记录触摸移动位置
            document.addEventListener("pointermove", event => {
                pointer.endTarget = event.target;
                pointer.lastX = event.clientX;
                pointer.lastY = event.clientY;
            }, { passive: true });

            //  监听pointercancel事件，处理触摸取消。在移动设备上pointer事件可能会因为各种情况被取消
            //  1.用户多任务切换频繁
            //  2.通知、来电等系统事件很多
            //  3.滑动触发系统滚动或回弹（iOS 橡皮筋）
            //  4.多指触控导致手势切换（如双指缩放）
            //  5.浏览器认为当前指针不再有效
            //  6.弹出系统手势拦截（长按菜单、拉伸/缩放等）
            //  这个事件监听器就像是一个安全网，确保无论发生什么意外，触摸状态都能被正确重置，保持应用的稳定性！
            document.addEventListener("pointercancel", event => handlePointerEnd(event));

            // 监听pointerup事件，处理触摸结束， 注意该事件不一定会被触发，可能因为移动端各种情况被取消，所以要配合pointercancel事件一起使用
            document.addEventListener("pointerup", event => handlePointerEnd(event));

            // 处理触摸结束，判断是点击还是滑动，注意event可能是pointerup或者pointercancel
            // 注意event是pointercancel时event.clientX和event.clientY可能无效，所以不要依赖此刻的坐标
            function handlePointerEnd(event) {

                pointer.deltaX = pointer.lastX - pointer.startX;
                pointer.deltaY = pointer.lastY - pointer.startY;
                pointer.endCause = event.type;

                // 计算指针移动的距离（绝对值）
                const absDeltaX = Math.abs(pointer.deltaX);
                const absDeltaY = Math.abs(pointer.deltaY);

                // 计算指针移动的角度 - [0-90]°
                pointer.angle = Math.atan2(absDeltaY, absDeltaX) * 180 / Math.PI;

                // 处理鼠标事件
                if (event.pointerType === "mouse") {

                    pointer.action = "mouse click";

                    // 鼠标左键点击时触发
                    if (event.button === 0 && pointer.startTarget === pointer.endTarget &&

                        // 点击的是body或者此刻content宽度等于窗口宽度
                        (event.target === document.body || event.target.parentElement?.getBoundingClientRect().width === window.innerWidth)) {
                        if (pointer.lastX < window.innerWidth / 2) {
                            switchChapter("prev");
                        } else {
                            switchChapter("next");
                        }
                    }
                    // 处理触摸事件
                } else if (event.pointerType === "touch" && isTouching) {

                    isTouching = false;

                    // 检查是否在有效区域内
                    if (event.target.parentElement === content ||
                        event.target === content ||
                        event.target === document.body) {

                        // 点击 - 手指在x/y轴滑动距离同时小于该阈值时才算作点击
                        if (absDeltaX < clickAndSwipeThreshold && absDeltaY < clickAndSwipeThreshold) {

                            pointer.action = "touch click";

                            // 点击左侧1/3区域
                            if (pointer.lastX < window.innerWidth / 3) {
                                switchChapter("prev");

                                // 点击右侧1/3区域
                            } else if (pointer.lastX > window.innerWidth / 3 * 2) {
                                switchChapter("next");

                                // 点击中间区域
                            } else {
                                // do nothing
                            }

                            // 水平滑动 - 手指在x轴滑动距离超过该阈值才算滑动
                        } else if (absDeltaX > clickAndSwipeThreshold) {

                            pointer.action = "touch horizontal swipe";

                            // 只有当滑动角度小于30度时才认为是水平滑动
                            if (pointer.angle < minSwipeAngle) {

                                if (pointer.deltaX > 0) {
                                    // 向右滑动 - 上一章
                                    switchChapter("prev");
                                } else {
                                    // 向左滑动 - 下一章
                                    switchChapter("next");
                                }
                            }

                            // 垂直滑动
                        } else {
                            pointer.action = "touch vertical swipe";
                            // do nothing保留原有的滚动行为
                        }
                    }
                }

                // 不要打印引用对象，因为pointermove事件会持续更新pointer对象，导致打印时指针信息不准确
                console.debug("指针事件信息:", JSON.stringify(pointer, (key, value) => {
                    if (value instanceof Node) {
                        return {
                            tagName: value.tagName,
                            id: value.id,
                            className: value.className,
                            childrenCount: value.children.length
                        };
                    }
                    return value;
                }, 4));

            }

            // 切换章节
            function switchChapter(action) {

                if (action === "prev") {
                    if (reader.readingProgress.chapterId === 0) {
                        alert("已经是第一章了");
                    } else {
                        reader.loadChapter(new ReadingProgress(reader.readingProgress.bookId, reader.readingProgress.chapterId - 1, 0, 0));
                    }
                } else {
                    if (reader.readingProgress.chapterId + 1 === reader.toc.length) {
                        alert("已经是最后一章了");
                    } else {
                        reader.loadChapter(new ReadingProgress(reader.readingProgress.bookId, reader.readingProgress.chapterId + 1, 0, 0));
                    }
                }
            }

        })(this);

    }

    // 保存设置
    async saveReaderSetting(setting) {

        // 保存设置
        await Aura.database.put(Aura.databaseProperties.stores.setting.name, setting);

        // 更新当前设置
        this.readerSetting = setting;
    }

    // 应用主题设置
    applyTheme(theme) {
        document.getElementById("theme").value = theme;
        document.getElementById("theme-value").textContent = theme;
        this.applyFontColor(Aura.reader.theme[theme].fontColor);
        this.applyBackgroundColor(Aura.reader.theme[theme].backgroundColor);
        this.applyContentBackgroundColor(Aura.reader.theme[theme].contentBackgroundColor);
    }

    // 应用字体大小设置
    applyFontSize(fontSize) {
        document.getElementById("font-size").value = fontSize;
        document.getElementById("font-size-value").textContent = fontSize + "px";
        document.getElementById("content").style.fontSize = fontSize + "px";
    }

    // 应用页面宽度设置
    applyPageWidth(width) {
        const pageWidth = document.getElementById("width");
        pageWidth.max = window.screen.width;
        pageWidth.value = width;
        document.getElementById("width-value").textContent = width + "px";
        document.getElementById("reader").style.width = width + "px";
    }

    // 应用页面内边距设置
    applyPagePadding(padding) {
        document.getElementById("padding").value = padding;
        document.getElementById("padding-value").textContent = padding + "px";
        document.getElementById("header").style.padding = `0 ${padding}px`;
        document.getElementById("footer").style.padding = `0 ${padding}px`;
        document.getElementById("content").style.padding = `0 ${padding}px`;
    }

    // 应用行高设置
    applyLineHeight(lineHeight) {
        document.getElementById("line-height").value = lineHeight;
        document.getElementById("line-height-value").textContent = lineHeight;
        document.getElementById("content").style.lineHeight = lineHeight;
    }

    // 应用字体颜色设置
    applyFontColor(fontColor) {
        document.getElementById("font-color").value = fontColor;
        document.getElementById("font-color-value").textContent = fontColor;
        document.getElementById("reader").style.color = fontColor;
    }

    // 应用正文背景色设置
    applyContentBackgroundColor(contentBackgroundColor) {
        document.getElementById("content-background-color").value = contentBackgroundColor;
        document.getElementById("content-background-color-value").textContent = contentBackgroundColor;
        document.getElementById("reader").style.backgroundColor = contentBackgroundColor;
    }

    // 应用网页背景色设置
    applyBackgroundColor(backgroundColor) {
        document.getElementById("background-color").value = backgroundColor;
        document.getElementById("background-color-value").textContent = backgroundColor;
        document.body.style.backgroundColor = backgroundColor;
    }

}

// 从sessionStorage读取bookId，注意读取到的值是字符串类型
new Reader().init(sessionStorage.getItem("bookId"));

