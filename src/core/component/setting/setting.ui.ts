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

import Ui from "../../../core/component/ui";
import EventUtil from "../../../core/util/event.util";
import StyleEngine from "../../../core/component/style.engine";
import StyleConfigurable from "../../../core/component/style-configurable";
import { ConfigurableStyleProperty } from "../../../core/component/constant/configurable.style.property";
import { assertExists } from "../../../core/util/assert.util";
import Optional from "../../../core/optional";
import { SettingName } from "../constant/setting.name";

/**
 * 阅读器设置面板
 * @author allurx
 */
export default class SettingUi extends Ui {
    private readonly asideElement: HTMLElement;
    private readonly closeElement: HTMLElement;
    private readonly resetElement: HTMLElement;
    private readonly itemsContainerElement: HTMLElement;
    private readonly items: {
        item: HTMLDivElement;
        property: ConfigurableStyleProperty;
        unit: string | null;
        control: HTMLInputElement;
        display: HTMLSpanElement;
    }[];

    // Mapping of setting target IDs to their corresponding UI instances
    private readonly uisMap: Map<string, Ui & StyleConfigurable>;

    /**
     * 构造函数
     * @param  canBootstrap - 是否可以自我引导
     * @param  uis - 可配置样式的UI组件列表
     */
    public constructor({
        canBootstrap = true,
        container,
        uis,
    }: {
        canBootstrap?: boolean;
        container: HTMLElement;
        uis: (Ui & StyleConfigurable)[];
    }) {
        super({
            root: { container, template: SettingUi.template },
            settingName: SettingName.SETTING,
            displayName: "设置",
        });
        this.asideElement = assertExists(this.root.querySelector<HTMLElement>("aside"));
        this.closeElement = assertExists(this.root.querySelector<HTMLElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLElement>(".reset"));
        this.itemsContainerElement = assertExists(this.root.querySelector<HTMLElement>("section"));
        this.items = Array.from(this.itemsContainerElement.querySelectorAll<HTMLDivElement>(".item")).map((item) => ({
            item,
            property: assertExists(item.getAttribute("data-property")) as ConfigurableStyleProperty,
            unit: item.getAttribute("data-unit"),
            control: assertExists(item.querySelector<HTMLInputElement>(".control")),
            display: assertExists(item.querySelector<HTMLSpanElement>(".display")),
        }));

        this.uisMap = new Map(uis.map((ui) => [ui.id, ui]));
        if (canBootstrap) this.uisMap.set(this.id, this);
    }

    /**
     * 切换设置面板显示状态
     * @return 当前实例
     */
    public toggleSetting() {
        const isOpen = this.root.classList.toggle("open");
        // 打开时默认激活第一个node
        if (isOpen && !this.asideElement.querySelector(".node.active")) {
            this.asideElement.querySelector<HTMLDivElement>(".node > .title")?.click();
        }
        return this;
    }

    /**
     * 渲染侧边栏
     * @return 当前实例
     */
    public renderAside() {
        const rootUis = this.buildTree();
        rootUis.forEach((rootUi) => {
            this.asideElement.appendChild(this.createNode(rootUi, true));
        });
        return this;
    }

    public highlightActiveNode(nodeElement: HTMLDivElement) {
        this.asideElement.querySelector(".node.active")?.classList.remove("active");
        nodeElement.classList.add("active");
        // 只有父节点才切换展开收起状态
        if (nodeElement.classList.contains("parent")) nodeElement.classList.toggle("collapsed");
        return this;
    }

    /**
     * 绑定设置面板关闭事件
     * @return 当前实例
     */
    public bindCloseSettingPanel() {
        EventUtil.bind(this.closeElement, "click", () => {
            this.root.classList.remove("open");
        });
        return this;
    }

    /**
     * 绑定重置设置事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindResetSetting(handler: () => Promise<void>) {
        EventUtil.bind(this.resetElement, "click", async () => {
            // 先执行重置操作再重置样式
            await handler();
            this.uisMap.forEach((ui) => ui.resetStyle());
        });
        return this;
    }

    public bindNodeClick() {
        EventUtil.delegate(this.asideElement, ".node > .title", "click", (_, title) => {
            const node = assertExists(title.parentElement);
            this.highlightActiveNode(node as HTMLDivElement);
            // 当前被设置的ui
            const id = assertExists(node.dataset["id"]);
            const ui = assertExists(this.uisMap.get(id));
            this.itemsContainerElement.dataset["id"] = id;

            // 显示对应ui的设置项并更新值
            const style = StyleEngine.getComputedStyle(ui.root);
            this.items.forEach(({ item, property, control, display }) => {
                if (ui.configurableStyleProperties.has(property)) {
                    let value = StyleEngine.getProperty(style, property);
                    if (
                        property === ConfigurableStyleProperty.COLOR ||
                        property === ConfigurableStyleProperty.BACKGROUND_COLOR
                    ) {
                        value = StyleEngine.rgbToHex(value);
                    }
                    item.style.display = "flex";
                    control.value = value.replace(/px$/, "");
                    display.textContent = value;
                } else {
                    item.style.display = "none";
                }
            });
        });
        return this;
    }

    /**
     * 绑定设置项变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindSettingChange(
        handler: (ui: Ui & StyleConfigurable, property: ConfigurableStyleProperty, value: string) => Promise<void>
    ) {
        this.items.forEach(({ property, unit, control, display }) => {
            EventUtil.bind(control, "input", (_, target) => {
                Optional.of(this.itemsContainerElement.dataset["id"])
                    .map((id) => this.uisMap.get(id))
                    .ifPresent((ui) => {
                        const value = StyleEngine.toUnit(target.value, unit);
                        display.textContent = value;
                        StyleEngine.setProperty(ui.root, property, value);
                        void handler(ui, property, value);
                    });
            });
        });
    }

    /**
     * 构建ui组件树形结构
     * @return 树形结构数组
     */
    private buildTree() {
        const uiArray = Array.from(this.uisMap.values());
        // 根节点(没有父Ui)
        const rootUis: Ui[] = [];
        uiArray.forEach((ui) => {
            const parentUi = this.findParentUi(ui.root, uiArray);
            if (parentUi) {
                parentUi.children.push(ui);
            } else {
                // 如果没有父Ui,说明这是根Ui
                rootUis.push(ui);
            }
        });
        return rootUis;
    }

    /**
     * 递归查找父Ui组件
     * @param element - 当前元素
     * @param uiArray - Ui组件数组
     * @return 父Ui组件或null
     */
    private findParentUi(element: HTMLElement, uiArray: Ui[]): Ui | null {
        if (element.parentElement) {
            return (
                uiArray.find((ui) => ui.root === element.parentElement) ??
                this.findParentUi(element.parentElement, uiArray)
            );
        }
        return null;
    }

    /**
     * 创建节点元素
     * @param ui - ui组件实例
     * @param isRoot - 是否为根节点
     * @return 节点元素
     */
    private createNode(ui: Ui, isRoot: boolean) {
        // 创建节点元素
        const node = document.createElement("div");
        const hasChildren = ui.hasChildren();
        node.classList.add("node");
        if (isRoot) node.classList.add("root");
        if (hasChildren) node.classList.add("parent", "collapsed");
        node.setAttribute("data-id", ui.id);

        // 创建标题元素
        const title = document.createElement("span");
        title.classList.add("title");
        title.textContent = ui.displayName;

        // 组装标题
        node.appendChild(title);

        // 递归创建子节点
        if (hasChildren) {
            const children = document.createElement("div");
            children.classList.add("children");
            ui.children.forEach((childUi) => {
                const childNode = this.createNode(childUi, false);
                if (!childUi.hasChildren()) childNode.classList.add("leaf");
                children.appendChild(childNode);
            });
            node.appendChild(children);
        }
        return node;
    }

    private static template = `
        <div class="setting">
            <aside></aside>
            <div class="main">
                <header>
                    <span class="reset" title="重置">↺</span>
                    <span class="close" title="关闭">✖</span>
                </header>
                <section>
                    <div class="item" data-property="font-size" data-unit="px">
                        <span class="name">字号</span>
                        <input class="control" min="12" max="100" step="1" type="range" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="width" data-unit="px">
                        <span class="name">宽度</span>
                        <input class="control" type="range" step="1" min="800" max="800" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="padding-top" data-unit="px">
                        <span class="name">上内边距</span>
                        <input type="range" class="control" min="0" max="100" step="1" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="padding-bottom" data-unit="px">
                        <span class="name">下内边距</span>
                        <input type="range" class="control" min="0" max="100" step="1" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="padding-left" data-unit="px">
                        <span class="name">左内边距</span>
                        <input type="range" class="control" min="0" max="100" step="1" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="padding-right" data-unit="px">
                        <span class="name">右内边距</span>
                        <input type="range" class="control" min="0" max="100" step="1" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="line-height" data-unit="px">
                        <span class="name">行高</span>
                        <input class="control" min="16" max="48" step="1" type="range" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="color">
                        <span class="name">文本颜色</span>
                        <input class="control" type="color" />
                        <span class="display"></span>
                    </div>
                    <div class="item" data-property="background-color">
                        <span class="name">背景颜色</span>
                        <input class="control" type="color" />
                        <span class="display"></span>
                    </div>
                </section>
                <footer class="footer"></footer>
            </div>
        </div>
        `;
}
