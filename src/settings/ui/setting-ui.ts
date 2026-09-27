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
import type SettingConfiguration from "../models/setting-configuration";
import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";
import EventUtil from "@/utils/event-util";
import SettingControlList from "./setting-control-list";
import SettingPreviewSession from "./setting-preview-session";
import type SettingUiListener from "./setting-ui-listener";

/**
 * 当前页面的主题与常规设置面板。
 *
 * 协调控件、可取消的预览和模态交互，已提交状态由监听器管理。
 *
 * @author allurx
 */
export default class SettingUi extends Ui implements SettingControlListener {
    private readonly themeElement: HTMLElement;
    private readonly generalElement: HTMLElement;
    private readonly itemsElement: HTMLElement;
    private readonly backdropElement = document.createElement("div");
    private readonly closeElement: HTMLButtonElement;
    private readonly resetElement: HTMLButtonElement;
    private readonly resetGeneralElement: HTMLButtonElement;
    private readonly previewSession = new SettingPreviewSession();
    private readonly previousInert = new Map<HTMLElement, boolean>();

    private listener: SettingUiListener | undefined;
    private controlList: SettingControlList | undefined;
    private generalSettings: readonly Setting[] = [];
    private opener: HTMLElement | undefined;
    private returnFocusTarget: HTMLElement | undefined;

    /**
     * @param container - 面板与遮罩的挂载容器。
     * @param inertElements - 容器外同样需要在模态期间隔离的页面内容。
     */
    public constructor(
        container: HTMLElement,
        private readonly inertElements: readonly HTMLElement[] = []
    ) {
        super({ root: { container, template: SettingUi.template } });

        // 遮罩与面板同级挂载，初始不参与交互或辅助技术访问。
        this.backdropElement.className = "setting-backdrop";
        this.backdropElement.hidden = true;
        this.backdropElement.inert = true;
        this.backdropElement.setAttribute("aria-hidden", "true");
        this.root.before(this.backdropElement);

        // 主题和常规设置分别就位，后续只更新控件的当前值。
        this.themeElement = assertExists(this.root.querySelector<HTMLElement>(".theme-items"));
        this.generalElement = assertExists(this.root.querySelector<HTMLElement>(".general-settings"));
        this.itemsElement = assertExists(this.root.querySelector<HTMLElement>(".items"));
        this.closeElement = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset"));
        this.resetGeneralElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset-general"));
    }

    /**
     * 初始化当前页面的设置和生命周期事件；没有常规项时不展示空分区。
     */
    public init(configuration: SettingConfiguration, listener: SettingUiListener, signal: AbortSignal): void {
        this.listener = listener;
        this.generalSettings = configuration.settings.filter((setting) => setting !== configuration.themeSetting);
        this.generalElement.hidden = this.generalSettings.length === 0;
        this.controlList = new SettingControlList(this.itemsElement, this.themeElement, configuration, this, signal);
        this.refresh();

        // 遮罩消费完整指针链，关闭不能穿透为正文手势。
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

        // 页面与常规重置使用独立范围，预览先撤销，完成后回读已提交值。
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
                this.performAndRefresh(() => {
                    this.cancelPreviews();
                    listener.reset();
                });
            },
            { signal }
        );
        EventUtil.bind(
            this.resetGeneralElement,
            "click",
            () => {
                if (this.resetGeneralElement.getAttribute("aria-disabled") === "true") return;
                this.performAndRefresh(() => {
                    this.cancelPreviews();
                    listener.resetGeneral();
                });
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

        // 响应式布局隐藏宽度输入时，焦点始终回到可见的面板控件。
        const widthVisibility = window.matchMedia("(max-width: 800px), (max-height: 500px) and (pointer: coarse)");
        widthVisibility.addEventListener(
            "change",
            () => {
                this.restoreVisibleFocus();
            },
            { signal }
        );
        EventUtil.bind(
            this.root,
            "focusout",
            (event: FocusEvent) => {
                const focused = event.target;
                if (!(focused instanceof HTMLElement) || event.relatedTarget !== null) return;
                queueMicrotask(() => {
                    if (
                        !signal.aborted &&
                        document.activeElement === document.body &&
                        focused.getClientRects().length === 0
                    ) {
                        this.restoreVisibleFocus();
                    }
                });
            },
            { signal }
        );

        // 错误弹窗关闭后，其原始焦点可能已被响应式布局隐藏。
        EventUtil.bind(
            document,
            "close",
            (event) => {
                if (
                    event.target instanceof HTMLDialogElement &&
                    !event.target.open &&
                    (document.activeElement === document.body || event.target.contains(document.activeElement)) &&
                    !document.querySelector("dialog:modal")
                ) {
                    this.restoreVisibleFocus();
                }
            },
            { capture: true, signal }
        );

        // 视口变化后同步范围并维持可见焦点，面板正文独立滚动。
        const observer = new ResizeObserver(() => {
            if (!this.root.classList.contains("open")) return;
            this.restoreVisibleFocus();
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && this.root.contains(focused)) {
                focused.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        });
        observer.observe(this.root);
        window.addEventListener(
            "resize",
            () => {
                EventUtil.run(() => {
                    this.refresh();
                    this.restoreVisibleFocus();
                });
            },
            { signal }
        );

        // 销毁时释放观察器与模态状态，不向即将移除的页面回写预览。
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
     * 打开或关闭面板；入口位于已收起的抽屉时，可指定另一个可见焦点目标。
     */
    public toggle(opener: HTMLElement, returnFocusTarget = opener): void {
        if (this.root.classList.contains("open")) this.close();
        else this.open(opener, returnFocusTarget);
    }

    /**
     * @returns 指定设置是否有尚未提交的预览。
     */
    public isPreviewing(setting: Setting): boolean {
        return this.previewSession.isPreviewing(setting);
    }

    /**
     * 刷新全部控件，正在输入的预览值不被已提交快照覆盖。
     */
    public refresh(): void {
        if (!this.controlList || !this.listener) return;
        this.controlList.render(
            (setting) => this.previewSession.getValue(setting) ?? this.requireListener().getValue(setting)
        );
        const customized = this.generalSettings.some(
            (setting) => this.requireListener().getValue(setting) !== undefined || this.isPreviewing(setting)
        );
        this.resetGeneralElement.setAttribute("aria-disabled", String(!customized));
    }

    /**
     * 将连续输入临时应用到页面，不提交持久化。
     */
    public preview(setting: Setting, value: string): void {
        this.previewSession.begin(setting, value);
        this.requireListener().preview(setting, value);
        this.requireControlList().renderSetting(setting, value);
        this.resetGeneralElement.setAttribute("aria-disabled", "false");
    }

    /**
     * 单项重置结束当前预览，并保留其他已提交设置。
     */
    public resetSetting(setting: Setting): void {
        this.performAndRefresh(() => {
            this.cancelPreviews();
            this.requireListener().resetSetting(setting);
        });
    }

    /**
     * 忽略取消之后迟到的 change，提交成功或失败都刷新当前控件。
     */
    public commit(setting: Setting, value: string): void {
        if (this.previewSession.isCancelled(setting)) return;
        this.previewSession.finish(setting);
        this.performAndRefresh(() => {
            this.requireListener().commit(setting, value);
        });
    }

    /**
     * 已提交状态与刷新都失败时保留两个错误，避免刷新掩盖原始保存失败。
     */
    private performAndRefresh(action: () => void): void {
        try {
            action();
        } catch (error) {
            try {
                this.refresh();
            } catch (refreshError) {
                throw new AggregateError([error, refreshError], "Setting update and refresh failed");
            }
            throw error;
        }
        this.refresh();
    }

    /**
     * 响应式隐藏控件或关闭错误弹窗后，恢复面板中的可见焦点。
     */
    private restoreVisibleFocus(): void {
        if (!this.root.classList.contains("open") || document.querySelector("dialog:modal")) return;
        const focused = document.activeElement;
        if (
            focused === document.body ||
            (focused instanceof HTMLElement && this.root.contains(focused) && focused.getClientRects().length === 0)
        ) {
            this.closeElement.focus();
        }
    }

    /**
     * 暂存背景的 inert 状态，并通过事件让阅读页面保存当前上下文。
     */
    private open(opener: HTMLElement, returnFocusTarget: HTMLElement): void {
        this.refresh();
        this.opener = opener;
        this.returnFocusTarget = returnFocusTarget;
        this.opener.setAttribute("aria-expanded", "true");

        this.previousInert.clear();
        const parent = assertExists(this.root.parentElement);
        for (const child of new Set([...parent.children, ...this.inertElements])) {
            if (!(child instanceof HTMLElement) || child === this.root || child === this.backdropElement) continue;
            this.previousInert.set(child, child.inert);
            child.inert = true;
        }

        this.backdropElement.hidden = false;
        this.backdropElement.inert = false;
        this.root.inert = false;
        this.root.setAttribute("aria-hidden", "false");
        this.root.classList.add("open");
        this.closeElement.focus();
        this.root.dispatchEvent(new Event("appearance-open", { bubbles: true }));
    }

    /**
     * 恢复预览后关闭；即使恢复失败也释放模态状态，避免页面永久不可交互。
     *
     * @param restoreFocus - 是否归还打开时记录的焦点。
     * @param restorePreviews - 页面销毁时为 false，只丢弃预览且不派发关闭事件。
     */
    private close(restoreFocus = true, restorePreviews = true): void {
        if (!this.root.classList.contains("open") && this.previousInert.size === 0) return;
        try {
            if (restorePreviews)
                this.performAndRefresh(() => {
                    this.cancelPreviews();
                });
            else this.previewSession.discard();
        } finally {
            this.root.classList.remove("open");
            this.root.setAttribute("aria-hidden", "true");
            this.root.inert = true;
            this.backdropElement.hidden = true;
            this.backdropElement.inert = true;
            for (const [element, inert] of this.previousInert) element.inert = inert;
            this.previousInert.clear();

            this.opener?.setAttribute("aria-expanded", "false");
            if (restoreFocus && this.returnFocusTarget?.isConnected)
                this.returnFocusTarget.focus({ preventScroll: true });
            this.opener = undefined;
            this.returnFocusTarget = undefined;
            if (restorePreviews) this.root.dispatchEvent(new Event("appearance-close", { bubbles: true }));
        }
    }

    /**
     * 焦点循环只包含当前可见控件，Escape 不继续触发阅读器快捷键。
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
     * 将全部尚未提交的设置恢复到当前页面的已提交值。
     */
    private cancelPreviews(): void {
        if (!this.listener) return;
        this.previewSession.cancel((setting) => {
            this.requireListener().restore(setting);
        });
    }

    /**
     * @returns 初始化后可用的控件列表。
     */
    private requireControlList(): SettingControlList {
        return assertExists(this.controlList, "Setting controls are not initialized");
    }

    /**
     * @returns 初始化后可用的状态监听器。
     */
    private requireListener(): SettingUiListener {
        return assertExists(this.listener, "Setting UI listener is not initialized");
    }

    private static readonly template = `
        <div id="setting" class="panel-scroll" role="dialog" aria-modal="true" aria-label="页面设置" aria-hidden="true" inert>
            <header>
                <h2 class="heading">设置</h2>
                <button class="close icon-button" type="button" title="关闭" aria-label="关闭设置">
                    <span class="icon icon-close" aria-hidden="true"></span>
                </button>
            </header>
            <div class="setting-body panel-scroll">
                <section class="theme-items" aria-label="页面主题"></section>
                <section class="general-settings" aria-labelledby="setting-general-title">
                    <header class="section-header">
                        <h3 id="setting-general-title" class="section-title">常规设置</h3>
                        <button class="reset-general icon-button" type="button" aria-label="重置常规设置" title="重置常规设置">
                            <span class="icon icon-reset" aria-hidden="true"></span>
                        </button>
                    </header>
                    <div class="items"></div>
                </section>
            </div>
            <footer>
                <button class="reset" type="button">
                    <span class="icon icon-reset" aria-hidden="true"></span>
                    重置当前页面
                </button>
            </footer>
        </div>
    `;
}
