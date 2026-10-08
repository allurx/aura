/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import ChoiceSetting from "./choice-setting";
import ChoiceSettingControl from "../controls/choice-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";

/**
 * 书封沿用稳定的缤纷配色，或共同跟随当前主题的表面与文字颜色。
 */
export default class BookCoverColorSetting extends ChoiceSetting {
    public constructor(bookList: HTMLElement) {
        super(
            "bookCoverColor",
            "封面配色",
            new Map([
                ["colorful", "缤纷"],
                ["theme", "随主题"],
            ]),
            "colorful",
            (value) => {
                bookList.dataset["coverColor"] = value;
            }
        );
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): ChoiceSettingControl {
        return new ChoiceSettingControl(this, listener, signal, (option, value) => {
            const preview = document.createElement("span");
            preview.className = "book-cover-color-preview";
            preview.dataset["coverColor"] = value;
            preview.setAttribute("aria-hidden", "true");
            for (let index = 0; index < 3; index++) preview.append(document.createElement("span"));
            option.append(preview);
        });
    }
}
