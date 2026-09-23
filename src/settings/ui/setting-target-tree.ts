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

import type SettingConfiguration from "../models/setting-configuration";
import type SettingTarget from "../models/setting-target";
import EventUtil from "@/utils/event-util";

/**
 * 按目标 DOM 包含关系构建的设置导航树。
 *
 * @author allurx
 */
export default class SettingTargetTree {
    private readonly targetByButton = new Map<HTMLButtonElement, SettingTarget>();
    private readonly nodeByTarget = new Map<SettingTarget, HTMLElement>();
    private activeTarget: SettingTarget | undefined;

    public constructor(
        container: HTMLElement,
        private readonly configuration: SettingConfiguration,
        private readonly activateHandler: (target: SettingTarget) => void,
        signal: AbortSignal
    ) {
        const roots = configuration.targets.filter((target) => this.findParent(target) === undefined);
        roots.forEach((target) => container.appendChild(this.createNode(target, true)));

        EventUtil.bind(
            container,
            "click",
            (event) => {
                if (!(event.target instanceof Element)) return;
                const button = event.target.closest<HTMLButtonElement>("button.title");
                if (!button || !container.contains(button)) return;
                const target = this.targetByButton.get(button);
                if (!target) return;

                const node = this.nodeByTarget.get(target);
                if (node?.classList.contains("parent") && target === this.activeTarget) {
                    const collapsed = node.classList.toggle("collapsed");
                    const childrenElement = node.querySelector<HTMLElement>(":scope > .children");
                    if (childrenElement) {
                        childrenElement.inert = collapsed;
                        childrenElement.setAttribute("aria-hidden", String(collapsed));
                    }
                    button.setAttribute("aria-expanded", String(!collapsed));
                }
                this.activate(target);
            },
            { signal }
        );

        const firstTarget = configuration.targets[0];
        if (firstTarget) this.activate(firstTarget);
    }

    private activate(target: SettingTarget): void {
        if (target === this.activeTarget) return;
        if (this.activeTarget) {
            const previousNode = this.nodeByTarget.get(this.activeTarget);
            previousNode?.classList.remove("active");
            previousNode?.querySelector("button.title")?.removeAttribute("aria-current");
        }
        this.activeTarget = target;
        const node = this.nodeByTarget.get(target);
        node?.classList.add("active");
        node?.querySelector("button.title")?.setAttribute("aria-current", "true");
        this.activateHandler(target);
    }

    private findParent(target: SettingTarget): SettingTarget | undefined {
        let parentElement = target.ui.root.parentElement;
        while (parentElement) {
            const parentTarget = this.configuration.targets.find((candidate) => candidate.ui.root === parentElement);
            if (parentTarget) return parentTarget;
            parentElement = parentElement.parentElement;
        }
        return undefined;
    }

    private createNode(target: SettingTarget, isRoot: boolean): HTMLElement {
        const node = document.createElement("div");
        node.className = isRoot ? "node root" : "node";
        this.nodeByTarget.set(target, node);

        const button = document.createElement("button");
        button.className = "title";
        button.type = "button";
        button.textContent = target.ui.displayName;
        this.targetByButton.set(button, target);
        node.appendChild(button);

        const children = this.configuration.targets.filter((candidate) => this.findParent(candidate) === target);
        if (children.length > 0) {
            node.classList.add("parent");
            button.setAttribute("aria-expanded", "true");
            const childrenElement = document.createElement("div");
            childrenElement.className = "children";
            children.forEach((child) => childrenElement.appendChild(this.createNode(child, false)));
            node.appendChild(childrenElement);
        } else if (!isRoot) {
            node.classList.add("leaf");
        }
        return node;
    }
}
