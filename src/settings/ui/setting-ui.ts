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

import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import SettingCatalog from "../definitions/setting-catalog";
import type SettingConfiguration from "../models/setting-configuration";
import SettingInteraction from "../models/setting-interaction";
import type SettingTarget from "../models/setting-target";
import Ui from "@/components/ui";
import { UiId } from "@/components/ui-id";
import { assertExists } from "@/utils/assert-util";
import EventUtil from "@/utils/event-util";
import SettingControlList from "./setting-control-list";
import SettingPreviewSession from "./setting-preview-session";
import type SettingUiListener from "./setting-ui-listener";

/**
 * Appearance 设置面板。
 *
 * 该类只协调目标导航、共享控件、预览会话和模态交互，不拥有已提交状态。
 *
 * @author allurx
 */
export default class SettingUi extends Ui implements SettingControlListener {
    private readonly targetsElement: HTMLElement;
    private readonly themeElement: HTMLElement;
    private readonly backdropElement = document.createElement("div");
    private readonly closeElement: HTMLButtonElement;
    private readonly resetElement: HTMLButtonElement;
    private readonly itemsElement: HTMLElement;
    private readonly previewSession = new SettingPreviewSession();
    private readonly previousInert = new Map<HTMLElement, boolean>();

    private listener: SettingUiListener | undefined;
    private controlList: SettingControlList | undefined;
    private activeTarget: SettingTarget | undefined;
    private readonly targetByButton = new Map<HTMLButtonElement, SettingTarget>();
    private readonly visibleTargets = new Map<Setting, SettingTarget>();
    private configuration: SettingConfiguration | undefined;
    private opener: HTMLElement | undefined;
    private returnFocusTarget: HTMLElement | undefined;

    /**
     * @param container - 面板与遮罩的挂载容器。
     * @param inertElements - 位于容器外、但同样需要在模态期间隔离的页面区域。
     */
    public constructor(
        container: HTMLElement,
        private readonly inertElements: readonly HTMLElement[] = []
    ) {
        super({ root: { container, template: SettingUi.template }, displayName: "设置" });

        // 遮罩与面板同级挂载，初始不参与交互或辅助技术访问。
        this.backdropElement.className = "setting-backdrop";
        this.backdropElement.hidden = true;
        this.backdropElement.inert = true;
        this.backdropElement.setAttribute("aria-hidden", "true");
        this.root.before(this.backdropElement);

        // 缓存模板中的功能区域，切换设置目标时复用这些容器。
        this.targetsElement = assertExists(this.root.querySelector<HTMLElement>(".targets"));
        this.themeElement = assertExists(this.root.querySelector<HTMLElement>(".theme-items"));
        this.closeElement = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset"));
        this.itemsElement = assertExists(this.root.querySelector<HTMLElement>(".items"));
    }

    /**
     * 初始化平面区域选择、共享控件和生命周期事件。
     *
     * @param configuration - 当前页面的 Appearance 能力清单
     * @param listener - 已提交状态协调器
     * @param signal - 页面生命周期信号
     */
    public init(configuration: SettingConfiguration, listener: SettingUiListener, signal: AbortSignal): void {
        // 先建立共享控件与目标映射，再开放面板交互。
        this.listener = listener;
        this.configuration = configuration;
        this.controlList = new SettingControlList(this.itemsElement, this.themeElement, configuration, this, signal);
        this.configureTargets(configuration, signal);

        // 遮罩消费完整指针链，关闭操作不能穿透为正文手势。
        for (const eventType of ["pointerdown", "pointerup", "pointercancel", "click"]) {
            EventUtil.bind(
                this.backdropElement,
                eventType,
                (event) => {
                    event.stopPropagation();
                    if (eventType === "click") this.close();
                },
                { signal }
            );
        }

        // 面板操作和键盘焦点约束共用当前页面的生命周期。
        EventUtil.bind(
            this.closeElement,
            "click",
            () => {
                this.close();
            },
            { signal }
        );

        EventUtil.bind(
            this.resetElement,
            "click",
            () => {
                this.cancelPreviews();
                listener.reset();
                this.refresh();
            },
            { signal }
        );

        EventUtil.bind(
            this.root,
            "keydown",
            (event) => {
                if (event instanceof KeyboardEvent) this.handleKeydown(event);
            },
            { signal }
        );

        // 滚动区随窗口高度切换时，让正在操作的控件继续留在可视区域。
        const observer = new ResizeObserver(() => {
            if (!this.root.classList.contains("open")) return;
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && this.root.contains(focused)) {
                focused.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        });
        observer.observe(this.root);

        // 销毁时释放观察器和模态状态，不向即将移除的页面回写预览。
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.close(false, false);
            },
            { once: true }
        );
    }

    /**
     * 打开或关闭设置面板；入口位于已收起的抽屉时，另指定可见的焦点归还目标。
     *
     * @param opener - 同步 aria-expanded 的实际入口
     * @param returnFocusTarget - 关闭后接收焦点的可见元素，默认使用入口本身
     */
    public toggle(opener: HTMLElement, returnFocusTarget = opener): void {
        if (this.root.classList.contains("open")) this.close();
        else this.open(opener, returnFocusTarget);
    }

    /**
     * @returns 指定目标和设置是否处于尚未提交的预览会话中。
     */
    public isPreviewing(target: SettingTarget, setting: Setting): boolean {
        return this.previewSession.isPreviewing(target, setting);
    }

    /**
     * 刷新当前视图的全部控件，不复制已提交 Appearance 状态。
     */
    public refresh(): void {
        if (!this.controlList || !this.listener) return;
        this.controlList.render(this.visibleTargets, (target, setting) =>
            this.requireListener().getValue(target, setting)
        );
    }

    /**
     * 将当前项预览应用到其原有目标，不提交持久化。
     */
    public preview(setting: Setting, value: string): void {
        const target = this.requireSettingTarget(setting);
        const interaction = new SettingInteraction(target, setting, value);
        this.previewSession.begin(setting, target);
        this.requireListener().preview(interaction);
        this.requireControlList().renderSetting(target, setting, value);
    }

    /**
     * 有预览时沿用其原目标，忽略已取消预览的迟到 change；提交后刷新所有可见控件。
     */
    public commit(setting: Setting, value: string): void {
        const previewTarget = this.previewSession.finish(setting);
        if (!previewTarget && this.previewSession.isCancelled(setting)) return;

        const target = previewTarget ?? this.requireSettingTarget(setting);
        const interaction = new SettingInteraction(target, setting, value);

        try {
            this.requireListener().commit(interaction);
        } finally {
            // Theme 也影响未显式覆盖的区域，提交后统一刷新实际值。
            this.refresh();
        }
    }

    /**
     * 使用产品区域而非 DOM 层级排序，每个区域均可直接选择。
     */
    private configureTargets(configuration: SettingConfiguration, signal: AbortSignal): void {
        const labels = new Map<UiId, string>([
            [UiId.CONTENT, "正文"],
            [UiId.BOOK_LIST, "书目"],
            [UiId.READER, "阅读区域"],
            [UiId.BOOKSHELF, "书架背景"],
            [UiId.APP, "页面背景"],
            [UiId.HEADER, "顶部工具"],
            [UiId.NAV, "分类栏"],
            [UiId.FOOTER, "底部工具"],
            [UiId.TOC, "章节目录"],
            [UiId.SETTING, "外观面板"],
        ]);

        for (const [uiId, label] of labels) {
            const target = configuration.findTarget(uiId);
            if (!target) continue;

            // 仅为当前页面开放的区域创建按钮，并保存按钮到目标的映射。
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.setAttribute("aria-pressed", "false");
            this.targetByButton.set(button, target);
            this.targetsElement.append(button);

            EventUtil.bind(
                button,
                "click",
                () => {
                    this.activate(target);
                },
                { signal }
            );
        }

        this.activate(assertExists(this.targetByButton.values().next().value));
    }

    /**
     * 切换目标前取消预览；共用控件只重新映射，Theme 始终留在页面区域。
     */
    private activate(target: SettingTarget): void {
        this.cancelPreviews();
        this.activeTarget = target;

        // Theme 始终指向页面目标，不随正在调整的 UI 区域改变归属。
        const configuration = assertExists(this.configuration);
        const themeTarget = assertExists(
            configuration.targets.find((candidate) => candidate.supports(SettingCatalog.THEME))
        );
        this.visibleTargets.clear();
        this.visibleTargets.set(SettingCatalog.THEME, themeTarget);

        // 正文入口聚合常用排版项，其中阅读宽度仍由 Reader 目标保存。
        if (target.ui.id === UiId.CONTENT) {
            this.visibleTargets.set(SettingCatalog.FONT_SIZE, target);
            this.visibleTargets.set(SettingCatalog.LINE_HEIGHT, target);
            this.visibleTargets.set(SettingCatalog.WIDTH, assertExists(configuration.findTarget(UiId.READER)));
        }
        for (const setting of [...target.settings].sort((left, right) => left.displayOrder - right.displayOrder)) {
            this.visibleTargets.set(setting, target);
        }

        // 最后同步选中标记、无障碍名称和控件显示值。
        for (const [button, candidate] of this.targetByButton) {
            button.setAttribute("aria-pressed", String(candidate === target));
        }
        this.itemsElement.setAttribute("aria-label", `${this.targetLabel(target)}外观选项`);
        this.refresh();
    }

    /**
     * 获取平面导航中面向用户的区域名称。
     */
    private targetLabel(target: SettingTarget): string {
        for (const [button, candidate] of this.targetByButton) {
            if (candidate === target) return button.textContent;
        }
        return target.ui.displayName;
    }

    /**
     * 每次打开保留上次调整的区域，事件供页面保存自身的阅读位置。
     * 暂存同级 UI 的 inert 状态，避免关闭时激活原本不可交互的区域。
     */
    private open(opener: HTMLElement, returnFocusTarget: HTMLElement): void {
        // 保留上次调整区域，并记录入口和关闭后的焦点目标。
        this.activate(assertExists(this.activeTarget));
        this.opener = opener;
        this.returnFocusTarget = returnFocusTarget;
        this.opener.setAttribute("aria-expanded", "true");

        // 容器内外的背景区域共用快照，关闭时先恢复交互再归还外部入口焦点。
        this.previousInert.clear();
        const parent = assertExists(this.root.parentElement);
        for (const child of new Set([...parent.children, ...this.inertElements])) {
            if (!(child instanceof HTMLElement) || child === this.root || child === this.backdropElement) continue;
            this.previousInert.set(child, child.inert);
            child.inert = true;
        }

        // 显示面板并交接焦点后，通知页面保存阅读上下文。
        this.backdropElement.hidden = false;
        this.backdropElement.inert = false;
        this.root.inert = false;
        this.root.setAttribute("aria-hidden", "false");
        this.root.classList.add("open");
        this.closeElement.focus();
        this.root.dispatchEvent(new Event("appearance-open", { bubbles: true }));
    }

    /**
     * 关闭时恢复已提交外观、原有 inert 状态与焦点；销毁页面只丢弃预览，不再派发关闭事件。
     *
     * @param restoreFocus - 是否将焦点归还到打开时记录的目标
     * @param restorePreviews - 是否恢复预览并派发关闭事件；页面销毁时关闭此选项
     */
    private close(restoreFocus = true, restorePreviews = true): void {
        if (!this.root.classList.contains("open") && this.previousInert.size === 0) return;

        // 普通关闭撤销未提交预览；销毁时只清理会话。
        if (restorePreviews) {
            this.cancelPreviews();
            this.refresh();
        } else {
            this.previewSession.discard();
        }

        // 隐藏面板与遮罩，并恢复打开前各区域的可交互状态。
        this.root.classList.remove("open");
        this.root.setAttribute("aria-hidden", "true");
        this.root.inert = true;
        this.backdropElement.hidden = true;
        this.backdropElement.inert = true;
        for (const [element, inert] of this.previousInert) element.inert = inert;
        this.previousInert.clear();

        // 可见页面归还入口焦点；销毁路径不再发送页面恢复事件。
        this.opener?.setAttribute("aria-expanded", "false");
        if (restoreFocus && this.returnFocusTarget?.isConnected) this.returnFocusTarget.focus({ preventScroll: true });
        this.opener = undefined;
        this.returnFocusTarget = undefined;
        if (restorePreviews) this.root.dispatchEvent(new Event("appearance-close", { bubbles: true }));
    }

    /**
     * 保持焦点在模态面板可见的控件中，并阻止 Escape 继续触发阅读器快捷键。
     */
    private handleKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.close();
            return;
        }

        if (event.key !== "Tab") return;
        const controls = [...this.root.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")].filter(
            (element) => !element.matches(":disabled") && element.getClientRects().length > 0
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    /**
     * 将尚未提交的预览恢复到当前页面的已提交值。
     */
    private cancelPreviews(): void {
        if (!this.listener) return;
        this.previewSession.cancel((target, setting) => {
            this.requireListener().restore(target, setting);
        });
    }

    /**
     * 获取当前控件实际作用的目标，避免跨区域或 Theme 写入错误目标。
     */
    private requireSettingTarget(setting: Setting): SettingTarget {
        return assertExists(this.visibleTargets.get(setting), `No visible target for setting ${setting.key}`);
    }

    private requireControlList(): SettingControlList {
        return assertExists(this.controlList, "Setting controls are not initialized");
    }

    private requireListener(): SettingUiListener {
        return assertExists(this.listener, "Setting UI listener is not initialized");
    }

    private static readonly template = `
        <div id="setting" class="panel-scroll" role="dialog" aria-modal="true" aria-label="页面设置" aria-hidden="true" inert>
            <header>
                <h2 class="heading">外观</h2>
                <button class="close icon-button" type="button" title="关闭" aria-label="关闭设置">
                    <span class="icon icon-close" aria-hidden="true"></span>
                </button>
            </header>
            <div class="setting-body panel-scroll">
                <section class="theme-items" aria-label="页面主题"></section>
                <div class="target-picker">
                    <h3>调整区域</h3>
                    <div class="targets" role="group" aria-label="调整区域"></div>
                </div>
                <section class="items" aria-label="外观选项"></section>
            </div>
            <footer><button class="reset" type="button">重置当前页面</button></footer>
        </div>
    `;
}
