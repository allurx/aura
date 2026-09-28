/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";
import { createElementFromHtml } from "@/utils/dom-util";
import { bind, run } from "@/utils/event-util";
import SettingControlList from "./setting-control-list";
import SettingPreviewSession from "./setting-preview-session";
import type SettingUiListener from "./setting-ui-listener";

/**
 * 当前页面的主题与常规设置面板。
 *
 * 协调控件、可取消的预览和模态交互，已提交状态由监听器管理。
 *
 */
export default class SettingUi extends Ui implements SettingControlListener {
    declare public readonly root: HTMLDialogElement;
    private readonly themeElement: HTMLElement;
    private readonly generalElement: HTMLElement;
    private readonly itemsElement: HTMLElement;
    private readonly closeElement: HTMLButtonElement;
    private readonly resetElement: HTMLButtonElement;
    private readonly resetGeneralElement: HTMLButtonElement;
    private readonly previewSession = new SettingPreviewSession();

    private listener: SettingUiListener | undefined;
    private controlList: SettingControlList | undefined;
    private generalSettings: readonly Setting[] = [];
    private opener: HTMLElement | undefined;
    private returnFocusTarget: HTMLElement | undefined;

    /**
     * @param container - 设置对话框的挂载容器。
     */
    public constructor(container: HTMLElement) {
        super(container.appendChild(createElementFromHtml<HTMLDialogElement>(SettingUi.template)));

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
        this.generalSettings = configuration.general;
        this.generalElement.hidden = this.generalSettings.length === 0;
        this.controlList = new SettingControlList(this.itemsElement, this.themeElement, configuration, this, signal);
        this.refresh();

        // 原生 backdrop 的事件目标是 dialog；仅完整发生在外部的点击关闭面板。
        let startedOnBackdrop = false;
        bind(
            this.root,
            "pointerdown",
            (event: PointerEvent) => {
                event.stopPropagation();
                startedOnBackdrop = this.isBackdrop(event);
            },
            { signal }
        );
        bind(
            this.root,
            "pointerup",
            (event) => {
                event.stopPropagation();
            },
            { signal }
        );
        bind(
            this.root,
            "pointercancel",
            (event) => {
                event.stopPropagation();
                startedOnBackdrop = false;
            },
            { signal }
        );
        bind(
            this.root,
            "click",
            (event: MouseEvent) => {
                event.stopPropagation();
                const dismiss = startedOnBackdrop && this.isBackdrop(event);
                startedOnBackdrop = false;
                if (dismiss) this.close();
            },
            { signal }
        );

        // 页面与常规重置使用独立范围，预览先撤销，完成后回读已提交值。
        bind(
            this.closeElement,
            "click",
            () => {
                this.close();
            },
            { signal }
        );
        bind(
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
        bind(
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
        bind(
            this.root,
            "cancel",
            (event) => {
                event.preventDefault();
                this.close();
            },
            { signal }
        );
        bind(
            this.root,
            "keydown",
            (event: KeyboardEvent) => {
                if (event.key === "Escape") event.stopPropagation();
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
        bind(
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
        bind(
            document,
            "close",
            (event) => {
                if (
                    event.target instanceof HTMLDialogElement &&
                    event.target !== this.root &&
                    !event.target.open &&
                    (document.activeElement === document.body || event.target.contains(document.activeElement))
                ) {
                    this.restoreVisibleFocus();
                }
            },
            { capture: true, signal }
        );

        // 视口变化后同步范围并维持可见焦点，面板正文独立滚动。
        const observer = new ResizeObserver(() => {
            if (!this.root.open) return;
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
                run(() => {
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
                this.close(true);
            },
            { once: true }
        );
    }

    /**
     * 打开或关闭面板；入口位于已收起的抽屉时，可指定另一个可见焦点目标。
     */
    public toggle(opener: HTMLElement, returnFocusTarget = opener): void {
        if (this.root.open) this.close();
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
        if (!this.root.open || [...document.querySelectorAll("dialog:modal")].some((dialog) => dialog !== this.root))
            return;
        const focused = document.activeElement;
        if (
            focused === document.body ||
            (focused instanceof HTMLElement && this.root.contains(focused) && focused.getClientRects().length === 0)
        ) {
            this.closeElement.focus();
        }
    }

    /**
     * 原生模态隔离背景，并通过事件让阅读页面保存当前上下文。
     */
    private open(opener: HTMLElement, returnFocusTarget: HTMLElement): void {
        this.root.inert = false;
        this.root.showModal();
        this.refresh();
        this.opener = opener;
        this.returnFocusTarget = returnFocusTarget;
        this.opener.setAttribute("aria-expanded", "true");

        this.root.dispatchEvent(new Event("appearance-open", { bubbles: true }));
    }

    /**
     * 恢复预览后关闭；即使恢复失败也释放模态状态，避免页面永久不可交互。
     *
     * @param discard - 页面销毁时只丢弃预览，不向旧页面派发关闭事件。
     */
    private close(discard = false): void {
        if (!this.root.open) {
            if (discard) this.previewSession.discard();
            return;
        }
        try {
            if (!discard)
                this.performAndRefresh(() => {
                    this.cancelPreviews();
                });
            else this.previewSession.discard();
        } finally {
            this.root.close();
            this.root.inert = true;

            this.opener?.setAttribute("aria-expanded", "false");
            if (!discard && this.returnFocusTarget?.isConnected) this.returnFocusTarget.focus({ preventScroll: true });
            this.opener = undefined;
            this.returnFocusTarget = undefined;
            if (!discard) this.root.dispatchEvent(new Event("appearance-close", { bubbles: true }));
        }
    }

    /**
     * 区分面板空白区域与原生 backdrop，避免从控件拖出时关闭。
     */
    private isBackdrop(event: MouseEvent): boolean {
        if (event.target !== this.root) return false;
        const bounds = this.root.getBoundingClientRect();
        return (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
        );
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
        <dialog id="setting" class="panel-scroll" aria-labelledby="setting-title" inert>
            <header>
                <h2 id="setting-title" class="heading">设置</h2>
                <button class="close icon-button" type="button" title="关闭" aria-label="关闭设置" autofocus>
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
        </dialog>
    `;
}
