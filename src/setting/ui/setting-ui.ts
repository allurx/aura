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

import type SettingControlListener from "../control/setting-control-listener";
import type Setting from "../definition/setting";
import type SettingConfiguration from "../model/setting-configuration";
import SettingInteraction from "../model/setting-interaction";
import type SettingTarget from "../model/setting-target";
import Ui from "@/component/ui";
import { assertExists } from "@/util/assert-util";
import EventUtil from "@/util/event-util";
import SettingControlList from "./setting-control-list";
import SettingPreviewSession from "./setting-preview-session";
import SettingTargetTree from "./setting-target-tree";
import type SettingUiListener from "./setting-ui-listener";

/**
 * Appearance 设置面板。
 *
 * 该类只协调目标导航、共享控件、预览会话和模态交互，不拥有已提交状态。
 *
 * @author allurx
 */
export default class SettingUi extends Ui implements SettingControlListener {
    private readonly asideElement: HTMLElement;
    private readonly backdropElement = document.createElement("div");
    private readonly closeElement: HTMLButtonElement;
    private readonly resetElement: HTMLButtonElement;
    private readonly itemsElement: HTMLElement;
    private readonly previewSession = new SettingPreviewSession();
    private readonly previousInert = new Map<HTMLElement, boolean>();

    private listener: SettingUiListener | undefined;
    private controlList: SettingControlList | undefined;
    private activeTarget: SettingTarget | undefined;
    private opener: HTMLElement | undefined;

    public constructor(container: HTMLElement) {
        super({ root: { container, template: SettingUi.template }, displayName: "设置" });
        this.backdropElement.className = "setting-backdrop";
        this.backdropElement.hidden = true;
        this.backdropElement.inert = true;
        this.backdropElement.setAttribute("aria-hidden", "true");
        this.root.before(this.backdropElement);
        this.asideElement = assertExists(this.root.querySelector<HTMLElement>("aside"));
        this.closeElement = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.resetElement = assertExists(this.root.querySelector<HTMLButtonElement>(".reset"));
        this.itemsElement = assertExists(this.root.querySelector<HTMLElement>(".items"));
    }

    /**
     * 初始化设置树、控件和生命周期事件。
     *
     * @param configuration - 当前页面的 Appearance 能力清单
     * @param listener - 已提交状态协调器
     * @param signal - 页面生命周期信号
     */
    public init(configuration: SettingConfiguration, listener: SettingUiListener, signal: AbortSignal): void {
        this.listener = listener;
        this.controlList = new SettingControlList(this.itemsElement, configuration, this, signal);
        new SettingTargetTree(
            this.asideElement,
            configuration,
            (target) => {
                this.activate(target);
            },
            signal
        );

        for (const eventType of ["pointerdown", "pointerup", "pointercancel", "click"]) {
            EventUtil.bind(
                this.backdropElement,
                eventType,
                (event) => {
                    event.stopPropagation();
                },
                { signal }
            );
        }

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
                if (event instanceof KeyboardEvent && event.key === "Escape") this.close();
            },
            { signal }
        );
        signal.addEventListener(
            "abort",
            () => {
                this.close(false, false);
            },
            { once: true }
        );
    }

    /** 打开或关闭设置面板。 */
    public toggle(opener: HTMLElement): void {
        if (this.root.classList.contains("open")) this.close();
        else this.open(opener);
    }

    /** @returns 指定目标和设置是否处于尚未提交的预览会话中。 */
    public isPreviewing(target: SettingTarget, setting: Setting): boolean {
        return this.previewSession.isPreviewing(target, setting);
    }

    /** 刷新当前目标的全部控件。 */
    public refresh(): void {
        if (!this.activeTarget || !this.controlList || !this.listener) return;
        this.controlList.render(this.activeTarget, (target, setting) =>
            this.requireListener().getValue(target, setting)
        );
    }

    public preview(setting: Setting, value: string): void {
        const target = this.requireActiveTarget();
        const interaction = new SettingInteraction(target, setting, value);
        this.previewSession.begin(setting, target);
        this.requireListener().preview(interaction);
        this.requireControlList().renderSetting(target, setting, value);
    }

    public commit(setting: Setting, value: string): void {
        const previewTarget = this.previewSession.finish(setting);
        if (!previewTarget && this.previewSession.isCancelled(setting)) return;
        const target = previewTarget ?? this.requireActiveTarget();
        const interaction = new SettingInteraction(target, setting, value);
        try {
            this.requireListener().commit(interaction);
        } finally {
            // Theme 会改变同一目标上未显式覆盖的 computed style，需整体刷新依赖它的控件。
            if (target === this.activeTarget) this.refresh();
        }
    }

    private activate(target: SettingTarget): void {
        this.cancelPreviews();
        this.activeTarget = target;
        this.refresh();
    }

    private open(opener: HTMLElement): void {
        this.opener = opener;
        this.opener.setAttribute("aria-expanded", "true");
        this.previousInert.clear();
        const parent = assertExists(this.root.parentElement);
        for (const child of parent.children) {
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
    }

    private close(restoreFocus = true, restorePreviews = true): void {
        if (!this.root.classList.contains("open") && this.previousInert.size === 0) return;
        if (restorePreviews) {
            this.cancelPreviews();
            this.refresh();
        } else {
            this.previewSession.discard();
        }
        this.root.classList.remove("open");
        this.root.setAttribute("aria-hidden", "true");
        this.root.inert = true;
        this.backdropElement.hidden = true;
        this.backdropElement.inert = true;
        for (const [element, inert] of this.previousInert) element.inert = inert;
        this.previousInert.clear();
        this.opener?.setAttribute("aria-expanded", "false");
        if (restoreFocus && this.opener?.isConnected) this.opener.focus();
        this.opener = undefined;
    }

    private cancelPreviews(): void {
        if (!this.listener) return;
        this.previewSession.cancel((target, setting) => {
            this.requireListener().restore(target, setting);
        });
    }

    private requireActiveTarget(): SettingTarget {
        return assertExists(this.activeTarget, "No active setting target");
    }

    private requireControlList(): SettingControlList {
        return assertExists(this.controlList, "Setting controls are not initialized");
    }

    private requireListener(): SettingUiListener {
        return assertExists(this.listener, "Setting UI listener is not initialized");
    }

    private static readonly template = `
        <div id="setting" role="dialog" aria-modal="true" aria-label="页面设置" aria-hidden="true" inert>
            <aside aria-label="设置目标"></aside>
            <div class="main">
                <header>
                    <button class="reset" type="button" title="重置" aria-label="重置当前页面设置">↺</button>
                    <button class="close" type="button" title="关闭" aria-label="关闭设置">✖</button>
                </header>
                <section class="items"></section>
                <footer class="footer"></footer>
            </div>
        </div>
    `;
}
