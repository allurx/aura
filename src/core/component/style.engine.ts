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

import { assertExists } from "../util/assert.util";
import { ConfigurableStyleProperty } from "./constant/configurable.style.property";

/**
 * 样式引擎
 * @author allurx
 */
export default class StyleEngine {
    public static getComputedStyle(element: Element) {
        return window.getComputedStyle(element);
    }

    public static toNumber(value: string) {
        return parseFloat(value);
    }

    public static toUnit(value: string, unit?: string | null) {
        return value + (unit ?? "");
    }

    public static getProperty(computedStyle: CSSStyleDeclaration, property: ConfigurableStyleProperty) {
        return computedStyle.getPropertyValue(property);
    }

    public static setProperty(element: HTMLElement, property: ConfigurableStyleProperty, value: string) {
        element.style.setProperty(property, value);
    }

    public static removeProperty(element: HTMLElement, property: ConfigurableStyleProperty) {
        element.style.removeProperty(property);
    }

    /**
     * rgb/rgba颜色值转换为十六进制颜色值
     * @param rgb rgb颜色值,如rgb(255, 255, 255)或rgba(255, 255, 255, 1)
     * @returns 十六进制颜色值,如#FFFFFF
     */
    public static rgbToHex(rgb: string): string {
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/.exec(rgb);
        if (!match) return "#000000";
        return (
            "#" +
            [match[1], match[2], match[3]].map((x) => parseInt(assertExists(x)).toString(16).padStart(2, "0")).join("")
        );
    }
}
