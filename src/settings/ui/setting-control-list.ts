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

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import type SettingTarget from "../models/setting-target";
import { SettingScope } from "../models/setting-scope";
import { assertExists } from "@/utils/assert-util";

/**
 * 设置面板共享控件的创建、筛选和渲染。
 *
 * @author allurx
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();

    public constructor(
        private readonly container: HTMLElement,
        private readonly pageContainer: HTMLElement,
        configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        [...configuration.settings]
            .sort((left, right) => left.displayOrder - right.displayOrder)
            .forEach((setting) => {
                const control = setting.createControl(listener, signal);
                this.controlBySetting.set(setting, control);
                this.containerFor(setting).appendChild(control.element);
            });
    }

    /**
     * 按目标映射的插入顺序展示共享控件；已就位的节点不移动，以保留原生输入焦点。
     *
     * @param targetBySetting - 当前显示的设置定义及其实际目标，按显示顺序排列
     * @param valueProvider - 从当前快照读取显式值；缺失值由控件解析为默认外观
     */
    public render(
        targetBySetting: ReadonlyMap<Setting, SettingTarget>,
        valueProvider: (target: SettingTarget, setting: Setting) => string | undefined
    ): void {
        // 隐藏当前区域不支持的控件，保留实例供后续区域复用。
        for (const [setting, control] of this.controlBySetting) {
            if (!targetBySetting.has(setting)) control.hide();
        }

        // 每个容器独立追踪顺序，只调整位置确实变化的节点。
        const previousByContainer = new Map<HTMLElement, HTMLElement>();
        for (const [setting, target] of targetBySetting) {
            const control = assertExists(
                this.controlBySetting.get(setting),
                `Missing control for setting ${setting.key}`
            );
            const container = this.containerFor(setting);
            const previousElement = previousByContainer.get(container);
            const expectedElement = previousElement ? previousElement.nextElementSibling : container.firstElementChild;
            if (control.element !== expectedElement) container.insertBefore(control.element, expectedElement);

            control.render(target, valueProvider(target, setting));
            control.show();
            previousByContainer.set(container, control.element);
        }
    }

    /**
     * 页面 Theme 和区域控件分别就位，复用同一实例，不随区域切换跳动。
     */
    private containerFor(setting: Setting): HTMLElement {
        return setting.scope === SettingScope.PAGE ? this.pageContainer : this.container;
    }

    /**
     * 渲染单个控件。
     */
    public renderSetting(target: SettingTarget, setting: Setting, value: string | undefined): void {
        assertExists(this.controlBySetting.get(setting), `Missing control for setting ${setting.key}`).render(
            target,
            value
        );
    }
}
