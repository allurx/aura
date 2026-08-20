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

/**
 * SPA页面生命周期。
 * @author allurx
 */
export default interface Page {
    /**
     * 将页面挂载到指定容器。
     * @param root - 页面挂载容器
     */
    mount(root: HTMLElement): Promise<void>;

    /**
     * 释放页面持有的事件、观察器和DOM资源。
     */
    dispose(): void;
}
