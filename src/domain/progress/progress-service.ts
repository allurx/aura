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

import ProgressRepository from "./progress-repository";
import Progress from "./progress";
import BaseService from "../base-service";

/**
 * 阅读进度服务
 * @author allurx
 */
export default class ProgressService extends BaseService<Progress> {
    public constructor() {
        super(new ProgressRepository());
    }
}
