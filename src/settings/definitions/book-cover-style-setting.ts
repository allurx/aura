/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import ChoiceSetting from "./choice-setting";
import ChoiceSettingControl from "../controls/choice-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";

/**
 * 仅改变书封的立体表现，保留同一书架布局、入口和页面材质。
 */
export default class BookCoverStyleSetting extends ChoiceSetting {
    public constructor(bookList: HTMLElement) {
        super(
            "bookCoverStyle",
            "封面造型",
            new Map([
                ["dimensional", "立体"],
                ["flat", "平面"],
            ]),
            "dimensional",
            (value) => {
                bookList.dataset["coverStyle"] = value;
            }
        );
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): ChoiceSettingControl {
        return new ChoiceSettingControl(this, listener, signal, (option, value) => {
            const preview = document.createElement("span");
            preview.className = "book-cover-style-preview";
            preview.dataset["coverStyle"] = value;
            preview.setAttribute("aria-hidden", "true");
            option.append(preview);
        });
    }
}
