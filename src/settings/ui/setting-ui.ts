/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import { PageName } from "@/constants/page-name";
import type SettingConfiguration from "../models/setting-configuration";
import Ui from "@/components/ui";
import enableLightDismiss from "@/components/dialog/light-dismiss";
import enablePanelFrame from "@/components/dialog/panel-frame";
import { assertExists } from "@/utils/assert-util";
import { createElementFromHtml } from "@/utils/dom-util";
import { bind, run } from "@/utils/event-util";
import SettingControlList from "./setting-control-list";
import type SettingUiListener from "./setting-ui-listener";

/**
 * 当前页面的主题与常规设置面板。
 *
 * 保持控件、滚动、焦点与模态交互，设置会话状态由监听器管理。
 */
export default class SettingUi extends Ui {
    declare public readonly root: HTMLDialogElement;
    private readonly bodyElement: HTMLElement;
    private readonly themeElement: HTMLElement;
    private readonly generalElement: HTMLElement;
    private readonly itemsElement: HTMLElement;
    private readonly closeElement: HTMLButtonElement;
    private readonly resetElement: HTMLButtonElement;
    private readonly resetGeneralElement: HTMLButtonElement;

    private listener: SettingUiListener | undefined;
    private controlList: SettingControlList | undefined;
    private generalSettings: readonly Setting[] = [];
    private readonly pendingDefaults = new Set<Setting>();
    private defaultObserver: ResizeObserver | undefined;

    /**
     * @param container - 设置对话框的挂载容器。
     */
    public constructor(
        private readonly container: HTMLElement,
        private readonly opener: HTMLButtonElement,
        private readonly canOpen: () => boolean
    ) {
        super(container.appendChild(createElementFromHtml<HTMLDialogElement>(SettingUi.template)));

        // 主题和常规设置分别就位，后续只更新控件的当前值。
        this.bodyElement = assertExists(this.root.querySelector<HTMLElement>(".setting-body"));
        this.themeElement = assertExists(this.root.querySelector<HTMLElement>(".theme-items"));
        this.generalElement = assertExists(this.root.querySelector<HTMLElement>(".general-settings"));
        this.itemsElement = assertExists(this.root.querySelector<HTMLElement>(".setting-groups"));
        this.closeElement = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset"));
        this.resetGeneralElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset-general"));
    }

    /**
     * 初始化当前页面的设置和生命周期事件；没有常规项时不展示空分区。
     */
    public init(configuration: SettingConfiguration, listener: SettingUiListener, signal: AbortSignal): void {
        this.listener = listener;
        assertExists(this.root.querySelector<HTMLElement>("#setting-title")).textContent =
            configuration.pageName === PageName.BOOKSHELF ? "书架设置" : "阅读设置";
        this.generalSettings = configuration.general;
        const resetLabel = configuration.pageName === PageName.BOOKSHELF ? "重置书架设置" : "重置阅读设置";
        assertExists(this.resetElement.querySelector<HTMLElement>(".reset-label")).textContent = resetLabel;
        this.generalElement.hidden = this.generalSettings.length === 0;
        this.controlList = new SettingControlList(
            this.itemsElement,
            this.themeElement,
            configuration,
            {
                commit: async (setting, value) => {
                    // input 已实时保存；关闭后的迟到事件不能继续改变当前页面外观。
                    if (this.root.open) await listener.commit(setting, value);
                },
                resetSetting: (setting) => listener.resetSetting(setting),
            },
            signal
        );
        // 样式默认值在自然布局后读取，首个绘制前准备完整控件值。
        this.defaultObserver = new ResizeObserver(() => {
            this.defaultObserver?.disconnect();
            const settings = [...this.pendingDefaults];
            this.pendingDefaults.clear();
            run(() => {
                this.renderSettings(settings);
            });
        });
        for (const setting of configuration.settings) this.pendingDefaults.add(setting);
        this.defaultObserver.observe(this.container);

        enableLightDismiss(this.root, signal);
        enablePanelFrame(
            this.root,
            assertExists(this.root.querySelector<HTMLElement>(":scope > header")),
            () => !this.container.hasAttribute("data-mobile-controls"),
            listener.getPanelFrame("settings"),
            signal
        );

        // 支持声明式命令时由按钮原生激活模态，脚本只维护外观会话和业务准入。
        if ("commandForElement" in HTMLButtonElement.prototype) {
            this.opener.commandForElement = this.root;
            this.opener.command = "show-modal";
            this.closeElement.commandForElement = this.root;
            this.closeElement.command = "request-close";
            bind(
                this.root,
                "command",
                (event) => {
                    if (!(event instanceof CommandEvent) || event.command !== "show-modal") return;
                    if (event.source !== this.opener || !this.canOpen()) {
                        event.preventDefault();
                        return;
                    }
                    try {
                        this.prepareOpen();
                    } catch (error) {
                        event.preventDefault();
                        throw error;
                    }
                },
                { signal }
            );
        } else {
            bind(
                this.opener,
                "click",
                () => {
                    if (!this.canOpen() || this.root.open) return;
                    this.prepareOpen();
                    this.root.showModal();
                },
                { signal }
            );
            bind(
                this.closeElement,
                "click",
                () => {
                    this.root.close();
                },
                { signal }
            );
        }

        // 面板只发出重置操作，保存与刷新由监听器协调。
        bind(this.resetElement, "click", () => listener.reset(), { signal });
        bind(
            this.resetGeneralElement,
            "click",
            async () => {
                if (this.resetGeneralElement.getAttribute("aria-disabled") === "true") return;
                await listener.resetGeneral();
            },
            { signal }
        );
        bind(
            this.root,
            "close",
            () => {
                if (this.root.open) return;
                this.root.inert = true;
                this.opener.setAttribute("aria-expanded", "false");
            },
            { signal }
        );
        bind(
            this.root,
            "keydown",
            (event: KeyboardEvent) => {
                if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
                if (event.target instanceof Element && event.target.closest("select:open")) return;
                event.preventDefault();
                event.stopPropagation();
                // 书架侧栏跨断点重新展示后，显式请求当前模态取消，不依赖关闭观察器的先后次序。
                if (typeof this.root.requestClose === "function") this.root.requestClose();
                else if (this.root.dispatchEvent(new Event("cancel", { cancelable: true }))) this.root.close();
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
                    this.restoreVisibleFocus(event.target);
                }
            },
            { capture: true, signal }
        );

        // 视口变化后同步范围并维持可见焦点，面板正文独立滚动。
        const observer = new ResizeObserver((entries) => {
            if (this.root.open) this.restoreVisibleFocus();
            const focused = this.root.open ? document.activeElement : null;
            if (focused instanceof HTMLElement && this.bodyElement.contains(focused)) {
                const viewport = this.bodyElement.getBoundingClientRect();
                const control = focused.getBoundingClientRect();
                const style = getComputedStyle(this.bodyElement);
                const top = viewport.top + this.bodyElement.clientTop + Number.parseFloat(style.scrollPaddingTop);
                const bottom =
                    viewport.top +
                    this.bodyElement.clientTop +
                    this.bodyElement.clientHeight -
                    Number.parseFloat(style.scrollPaddingBottom);
                if (control.top < top) this.bodyElement.scrollTop += control.top - top;
                else if (control.bottom > bottom) this.bodyElement.scrollTop += control.bottom - bottom;
            }
            // 页面尺寸影响响应式默认值；面板开合或分组展开只维护面板自身可见范围。
            if (entries.some((entry) => entry.target === this.container))
                run(() => {
                    this.renderSettings();
                });
        });
        observer.observe(this.bodyElement);
        observer.observe(this.container);

        // 销毁时释放观察器、待解析默认值和原生模态状态。
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.defaultObserver?.disconnect();
                this.pendingDefaults.clear();
                this.root.close();
                this.root.inert = true;
                this.opener.setAttribute("aria-expanded", "false");
            },
            { once: true }
        );
    }

    /**
     * 按会话给出的显示值刷新受影响的控件；未指定范围时读取全部当前默认值。
     */
    public refresh(settings?: readonly Setting[]): void {
        this.renderSettings(settings, settings !== undefined);
    }

    /**
     * 面板几何提交只刷新重置入口，不中断正在进行的拖动或缩放。
     */
    public refreshResetState(): void {
        const listener = this.listener;
        if (!listener) return;
        const customized =
            this.generalSettings.some((item) => listener.getValue(item) !== undefined) || listener.hasCustomLayout();
        const disabled = String(!customized);
        if (this.resetGeneralElement.getAttribute("aria-disabled") !== disabled)
            this.resetGeneralElement.setAttribute("aria-disabled", disabled);
    }

    /**
     * 已提交的显式值即时显示；重置产生的 CSS 默认值合并到下一次自然布局通知。
     */
    private renderSettings(settings?: readonly Setting[], deferDefaultStyles = false): void {
        const listener = this.listener;
        if (!this.controlList || !listener) return;
        if (settings?.length === 0) return;
        const deferred = this.controlList.render((item) => listener.getValue(item), settings, deferDefaultStyles);
        for (const setting of settings ?? []) this.pendingDefaults.delete(setting);
        for (const setting of deferred) this.pendingDefaults.add(setting);
        if (this.pendingDefaults.size > 0) this.defaultObserver?.observe(this.container);
        else this.defaultObserver?.disconnect();
        this.refreshResetState();
    }

    /**
     * 响应式隐藏控件或关闭错误弹窗后，恢复面板中的可见焦点。
     */
    private restoreVisibleFocus(closedDialog?: HTMLDialogElement): void {
        if (!this.root.open || [...document.querySelectorAll("dialog:modal")].some((dialog) => dialog !== this.root))
            return;
        const focused = document.activeElement;
        if (
            focused === document.body ||
            closedDialog?.contains(focused) ||
            (focused instanceof HTMLElement && this.root.contains(focused) && focused.getClientRects().length === 0)
        ) {
            this.closeElement.focus({ preventScroll: true });
        }
    }

    /**
     * 在原生模态打开前恢复已提交的控件值，背景隔离和焦点由浏览器管理。
     */
    private prepareOpen(): void {
        this.controlList?.restoreValues();
        this.opener.setAttribute("aria-expanded", "true");
        this.root.inert = false;
    }

    private static readonly template = `
        <dialog id="setting" aria-labelledby="setting-title" inert>
            <header>
                <div class="heading">
                    <h2 id="setting-title">设置</h2>
                </div>
                <button class="close icon-button" type="button" title="关闭" aria-label="关闭设置" autofocus>
                    <span class="icon icon-close" aria-hidden="true"></span>
                </button>
            </header>
            <div class="setting-body panel-scroll">
                <section class="general-settings" aria-labelledby="setting-general-title">
                    <header class="section-header">
                        <h3 id="setting-general-title" class="section-title">常规设置</h3>
                        <button class="reset-general" type="button" aria-label="重置常规设置" title="恢复常规设置默认值，保留主题">恢复默认</button>
                    </header>
                    <div class="setting-groups"></div>
                </section>
                <section class="theme-items" aria-label="页面主题"></section>
            </div>
            <footer>
                <button class="reset" type="button">
                    <span class="icon icon-reset" aria-hidden="true"></span>
                    <span class="reset-label">重置设置</span>
                </button>
            </footer>
        </dialog>
    `;
}
