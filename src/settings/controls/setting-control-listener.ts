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

import type Setting from "../definitions/setting";

/**
 * 设置控件产生的预览和提交事件。
 *
 * @author allurx
 */
export default interface SettingControlListener {
    /**
     * 将连续输入交给当前目标预览，直到确认或取消。
     */
    preview(setting: Setting, value: string): void;

    /**
     * 确认控件值；有预览时沿用预览目标，避免切换区域后误写其他 UI。
     */
    commit(setting: Setting, value: string): void;
}
