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

import Ui from "@/component/ui";
import { UiId } from "@/component/ui-id";
import EventUtil from "@/util/event-util";
import { assertExists } from "@/util/assert-util";
import SettingItem from "./setting-item";
import Setting from "@/domain/setting/setting";
import FontSizeSettingItem from "./item/font-size-setting-item";
import ColorSettingItem from "./item/color-setting-item";
import BackgroundColorSettingItem from "./item/background-color-setting-item";
import { SettingItemChange, SettingKey, THEME_SETTING_KEY, UiSettingChange } from "./setting-change";

export type SettingItemConstructor = new () => SettingItem;
export type UiSettingItemMap = ReadonlyMap<Ui, readonly SettingItemConstructor[]>;

/**
 * 页面设置面板
 * @author allurx
 */
export default class SettingUi extends Ui {
    private readonly asideElement: HTMLElement;
    private readonly closeElement: HTMLElement;
    private readonly resetElement: HTMLElement;
    private readonly itemsContainerElement: HTMLElement;

    // All setting items
    private readonly settingItems: Set<SettingItem> = new Set<SettingItem>();

    // Mapping of Uis to their SettingItems
    private readonly uiSettingItemMap: Map<Ui, SettingItem[]> = new Map<Ui, SettingItem[]>();

    // Mapping of UiId to Ui
    private readonly uiIdMap: Map<UiId, Ui> = new Map<UiId, Ui>();

    private activeUi: Ui | undefined;
    private readonly previewingUiMap = new Map<SettingKey, Ui>();

    /**
     * 构造函数
     * @param  container - 容器元素
     * @param  uiSettingItemMap - UI组件与其可配置设置项类的映射
     */
    public constructor({
        container,
        uiSettingItemMap,
    }: {
        container: HTMLElement;
        uiSettingItemMap: UiSettingItemMap;
    }) {
        super({
            root: { container, template: SettingUi.template },
            displayName: "设置",
        });

        this.asideElement = assertExists(this.root.querySelector<HTMLElement>("aside"));
        this.closeElement = assertExists(this.root.querySelector<HTMLElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLElement>(".reset"));
        this.itemsContainerElement = assertExists(this.root.querySelector<HTMLElement>("section"));

        const completeUiSettingItemMap = new Map(uiSettingItemMap);
        completeUiSettingItemMap.set(this, [FontSizeSettingItem, ColorSettingItem, BackgroundColorSettingItem]);
        this.createMappedUiSettingItems(completeUiSettingItemMap).createSettingItemElements();
    }

    /**
     * 切换设置面板显示状态
     * @return 当前实例
     */
    public toggleSetting() {
        // 打开时默认激活第一个node
        if (this.root.classList.toggle("open") && !this.asideElement.querySelector(".node.active")) {
            this.asideElement.querySelector<HTMLDivElement>(".node > .title")?.click();
        }
        return this;
    }

    /**
     * 渲染侧边栏
     * @return 当前实例
     */
    public renderAside() {
        this.buildTree().forEach((rootUi) => {
            this.asideElement.appendChild(this.createNode(rootUi, true));
        });
        return this;
    }

    /**
     * 应用设置到各个UI组件
     * @param  settings - 设置映射
     */
    public applySettings(settings: ReadonlyMap<UiId, Setting>): this {
        this.uiSettingItemMap.forEach((uiSettingItems, ui) => {
            const uiSetting = settings.get(ui.id);
            uiSettingItems.forEach((settingItem) => {
                const value = uiSetting?.[settingItem.id];
                if (settingItem.accepts(value)) settingItem.apply(ui, value);
            });
        });
        return this;
    }

    /**
     * 绑定设置面板关闭事件
     * @return 当前实例
     */
    public bindCloseSetting(signal: AbortSignal): this {
        EventUtil.bind(
            this.closeElement,
            "click",
            () => {
                this.root.classList.remove("open");
            },
            { signal }
        );
        return this;
    }

    /**
     * 绑定重置设置事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindResetSetting(handler: () => Promise<void>, signal: AbortSignal): this {
        EventUtil.bind(
            this.resetElement,
            "click",
            handler,
            { signal }
        );
        return this;
    }

    /**
     * 重置当前页面中的全部设置效果和控件值。
     */
    public resetSettings(): this {
        this.previewingUiMap.clear();
        this.uiSettingItemMap.forEach((settingItems, ui) => {
            settingItems.forEach((settingItem) => settingItem.reset(ui));
        });

        const activeUi = this.activeUi;
        if (activeUi) {
            this.uiSettingItemMap.get(activeUi)?.forEach((settingItem) => {
                settingItem.setControlValue(activeUi, undefined);
                settingItem.setDisplayValue(activeUi, undefined);
            });
        }
        return this;
    }

    public bindNodeClick(settings: ReadonlyMap<UiId, Setting>, signal: AbortSignal): this {
        EventUtil.delegate(
            this.asideElement,
            ".node > .title",
            "click",
            (event, title) => {
                const node = assertExists(title.parentElement);

                // 1.用户触发
                // 2.节点有子节点
                // 3.节点处于展开状态
                // 同时满足以上条件则折叠节点
                if (event.isTrusted && node.classList.contains("parent") && node.classList.contains("active"))
                    node.classList.toggle("collapsed");

                // 高亮当前节点
                this.highlightActiveNode(node);

                // 当前被设置的ui
                const ui = assertExists(this.uiIdMap.get(assertExists(node.dataset["id"]) as UiId));
                this.activeUi = ui;

                // 显示ui对应的设置项
                const uiSettingItems = this.uiSettingItemMap.get(ui) ?? [];
                const uiSetting = settings.get(ui.id);
                this.settingItems.forEach((settingItem) => {
                    if (uiSettingItems.includes(settingItem)) {
                        const value = uiSetting?.[settingItem.id];
                        const acceptedValue = settingItem.accepts(value) ? value : undefined;
                        settingItem.setControlValue(ui, acceptedValue);
                        settingItem.setDisplayValue(ui, acceptedValue);
                        settingItem.show();
                    } else {
                        settingItem.hide();
                    }
                });
            },
            { signal }
        );
        return this;
    }

    /**
     * 预览并同步由设置面板之外的交互产生的设置变化。
     */
    public previewExternal(ui: Ui, change: SettingItemChange): this {
        const settingItem = assertExists(
            this.uiSettingItemMap.get(ui)?.find((item) => item.id === change.key),
            `${ui.id} does not support setting ${change.key}`
        );
        this.preview(settingItem, ui, change);
        if (this.activeUi === ui) settingItem.setControlValue(ui, change.value);
        return this;
    }

    public isPreviewing(ui: Ui, key: SettingKey): boolean {
        return this.previewingUiMap.get(key) === ui;
    }

    /**
     * 绑定设置项变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindSettingCommit(
        handler: (change: UiSettingChange) => Promise<void>,
        signal: AbortSignal
    ): this {
        this.settingItems.forEach((item) => {
            let previewUi: Ui | undefined;
            item.bindChange(
                {
                    preview: (change) => {
                        previewUi = this.requireActiveUi();
                        this.previewingUiMap.set(change.key, previewUi);
                        this.preview(item, previewUi, change);
                    },
                    commit: async (change) => {
                        const ui = previewUi ?? this.requireActiveUi();
                        previewUi = undefined;
                        this.preview(item, ui, change);
                        this.previewingUiMap.delete(change.key);
                        await handler({ ...change, ui });
                    },
                },
                signal
            );
        });
        return this;
    }

    private preview(settingItem: SettingItem, ui: Ui, change: SettingItemChange): void {
        if (settingItem.id !== change.key || !settingItem.accepts(change.value)) {
            throw new Error(`Invalid ${change.key} setting value: ${change.value}`);
        }
        settingItem.setDisplayValue(ui, change.value);
        settingItem.apply(ui, change.value);

        if (change.key === THEME_SETTING_KEY) {
            this.uiSettingItemMap
                .get(ui)
                ?.filter((item) => item !== settingItem)
                .forEach((item) => {
                    item.setControlValue(ui, undefined);
                    item.setDisplayValue(ui, undefined);
                });
        }
    }

    private requireActiveUi(): Ui {
        return assertExists(this.activeUi, "No active setting UI");
    }

    private highlightActiveNode(nodeElement: HTMLElement) {
        this.asideElement.querySelector(".node.active")?.classList.remove("active");
        nodeElement.classList.add("active");
        return this;
    }

    /**
     * 构建ui组件树形结构
     * @return 树形结构数组
     */
    private buildTree() {
        const uiArray = Array.from(this.uiIdMap.values());
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
        if (hasChildren) node.classList.add("parent");
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

    private createMappedUiSettingItems(uiSettingItemMap: UiSettingItemMap) {
        // 临时Map用于存储每个构造器对应的唯一实例
        const constructorInstanceMap = new Map<SettingItemConstructor, SettingItem>();

        for (const [ui, settingItemConstructors] of uiSettingItemMap) {
            const uiSettingItemInstances: SettingItem[] = [];
            for (const settingItemConstructor of settingItemConstructors) {
                let settingItem = constructorInstanceMap.get(settingItemConstructor);
                // 如果这个构造器还没有实例化过,就new一个
                if (!settingItem) {
                    settingItem = new settingItemConstructor();
                    constructorInstanceMap.set(settingItemConstructor, settingItem);
                    // 放入全局Set
                    this.settingItems.add(settingItem);
                }
                uiSettingItemInstances.push(settingItem);
            }
            // 放入Ui对应的Map
            this.uiSettingItemMap.set(ui, uiSettingItemInstances);
            this.uiIdMap.set(ui.id, ui);
        }
        return this;
    }

    private createSettingItemElements() {
        Array.from(this.settingItems)
            .sort((a, b) => a.displayOrder() - b.displayOrder())
            .forEach((settingItem) => {
                this.itemsContainerElement.appendChild(settingItem.element);
            });
        return this;
    }

    private static template = `
        <div id="setting">
            <aside></aside>
            <div class="main">
                <header>
                    <span class="reset" title="重置">↺</span>
                    <span class="close" title="关闭">✖</span>
                </header>
                <section>
                </section>
                <footer class="footer"></footer>
            </div>
        </div>
        `;
}
