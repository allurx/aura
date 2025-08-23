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

import Aura from "./aura.js";
import Database from "./database/database.js";

export default class Bookshelf {

    bookGenres = [
        { id: 1, name: "玄幻" },
        { id: 2, name: "奇幻" },
        { id: 3, name: "武侠" },
        { id: 4, name: "仙侠" },
        { id: 5, name: "科幻" },
        { id: 6, name: "末日" },
        { id: 7, name: "都市" },
        { id: 8, name: "职场" },
        { id: 9, name: "言情" },
        { id: 10, name: "军事" },
        { id: 11, name: "历史" },
        { id: 12, name: "游戏" },
        { id: 13, name: "体育" },
        { id: 14, name: "灵异" },
        { id: 15, name: "恐怖" },
        { id: 16, name: "魔幻" }
    ];

    // 当前书籍分类
    currentBookGenre = 1;

    init() {
        this.initNav();
        this.bindEvent();
    }

    // 初始化左侧导航栏
    initNav() {
        const navElement = document.querySelector("nav");
        this.bookGenres.forEach(bookGenre => {
            const button = document.createElement("button");
            button.id = bookGenre.id;
            button.textContent = bookGenre.name;
            navElement.appendChild(button);
        })
    }

    // 书籍分类切换
    switchGenre(event) {
        const button = event.target;
        document.querySelector("nav button.active")?.classList.remove("active");
        button.classList.add("active");
        this.currentBookGenre = Number(button.id);

        // 删除原先书籍分类下的页面元素
        document.querySelectorAll(".book").forEach(el => el.remove());

        // 找到当前书籍类型下的文件，并将其添加的页面元素中
        Aura.database.getAllByIndex(Aura.databaseProperties.stores.book.name, Aura.databaseProperties.stores.book.indexes.bookGenreIndex.name, this.currentBookGenre)
            .then(books => books.forEach(book => this.createBookElement(document.getElementById("books"), book)));

    }

    // 添加书籍
    addBook(event) {
        Array.from(event.target.files)
            .map(async file => {

                const hash = await this.hashFile(file);
                console.log("SHA-256: ", hash);

                const book = { name: file.name, genre: this.currentBookGenre };

                // 解析书籍
                const chapters = await this.parseBook(file);

                book.chapters = chapters.map(chapter => ({ id: chapter.id, name: chapter.name }));

                // 将书籍和章节存入数据库
                Aura.database.transaction(
                    [Aura.databaseProperties.stores.book.name, Aura.databaseProperties.stores.chapter.name, Aura.databaseProperties.stores.readingProgress.name],
                    Database.READ_WRITE,
                    async (dbop) => {

                        // book.id由数据库自动生成
                        book.id = await dbop.add(Aura.databaseProperties.stores.book.name, book);
                        chapters.forEach(chapter => chapter.bookId = book.id);

                        await dbop.putAll(Aura.databaseProperties.stores.chapter.name, chapters);
                        await dbop.put(Aura.databaseProperties.stores.readingProgress.name, { bookId: book.id, chapterId: 0, lineIndex: 0, scrollTop: 0 });
                        this.createBookElement(document.getElementById("books"), book);
                    });
            });
        // 重置，支持重复上传同一文件
        event.target.value = "";

    }

    // 计算文件的SHA-256哈希值
    async hashFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        return hashHex;
    }

    // 创建书籍元素
    createBookElement(booksElement, book) {
        const div = document.createElement("div");
        div.id = book.id;
        div.className = "book";
        div.textContent = book.name.substring(0, book.name.lastIndexOf("."));
        booksElement.appendChild(div);
    }

    // 阅读书籍
    readBook(event) {
        const bookId = Number(event.target.id);
        window.location.href = "./page/reader.html";
        //const win = window.open("./page/reader.html");
        window.sessionStorage.setItem("bookId", bookId);
    }

    // 解析书籍
    parseBook(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                const chapters = [];
                const text = reader.result;

                // 匹配常见章节格式，支持多种标题形式
                const chapterRegex = /(第[0-9一二三四五六七八九十百千]+[章卷][\-–—\s]*[^\n]*)|(卷[0-9一二三四五六七八九十百千]+[\-–—\s]*[^\n]*)/g;
                const matches = [...text.matchAll(chapterRegex)];

                // 没有匹配到章节，则全文件作为一个章节
                if (matches.length === 0) {
                    chapters.push({
                        id: 0,
                        name: "全文",
                        content: text.trim()
                    });
                    resolve(chapters);
                    return;
                }

                // 如果开头有介绍文字（第一个章节前有内容）
                if (matches[0].index > 0) {
                    chapters.push({
                        id: chapters.length,
                        name: "序章",
                        content: text.slice(0, matches[0].index).trimStart()
                    });
                }

                // 遍历每个章节匹配
                matches.forEach((match, i) => {
                    const chapterTitle = match[0].trim();
                    const start = match.index + chapterTitle.length;
                    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
                    const content = text.slice(start, end).trimStart();

                    chapters.push({
                        // 保证连续从0开始
                        id: chapters.length,
                        name: chapterTitle,
                        content
                    });
                });

                resolve(chapters);
            };

            reader.onerror = reject;
            reader.readAsText(file, "UTF-8");
        });
    }

    // 清空书架
    async clearBookshelf() {
        if (confirm("确定要清空书架中的所有书籍吗？")) {

            const bookStoreName = Aura.databaseProperties.stores.book.name;
            const readingProgressStoreName = Aura.databaseProperties.stores.readingProgress.name;
            const chapterStoreName = Aura.databaseProperties.stores.chapter.name;
            const chapterIndexName = Aura.databaseProperties.stores.chapter.indexes.bookIdIndex.name;

            // 在事务外部获取所有书籍的列表
            const books = await Aura.database.getAll(bookStoreName);
            if (books.length === 0) return;

            // 将所有书的所有操作合并到一个事务中
            await Aura.database.transaction(
                [bookStoreName, chapterStoreName, readingProgressStoreName],
                Database.READ_WRITE,
                async (dbop) => {

                    this.showLoading(true);

                    // 每本书有三个数据库操作，合并所有操作
                    const deletePromises = books.flatMap(book => [
                        dbop.deleteByKey(bookStoreName, book.id),
                        dbop.deleteByKey(readingProgressStoreName, book.id),
                        dbop.deleteAllByIndex(chapterStoreName, chapterIndexName, book.id)
                    ]);

                    // 等待所有删除操作完成
                    await Promise.all(deletePromises);

                }).then(() => {
                    console.log("书架已清空！");
                    document.querySelector("nav button").click();
                }).finally(() => {
                    this.showLoading(false);
                });

        }
    }

    // 显示或隐藏加载动画
    showLoading(show) {
        return document.getElementById("loading-overlay").hidden = !show;
    }

    // 绑定事件
    bindEvent() {
        Aura.addEventListenerToAll(document.querySelectorAll("nav button"), "click", this.switchGenre.bind(this));
        Aura.addEventListenerTo(document.getElementById("book-input"), "change", this.addBook.bind(this));
        Aura.addEventListenerTo(document.getElementById("clear-bookshelf"), "click", this.clearBookshelf.bind(this));

        // book元素是动态生成的，需要通过事件冒泡判断点击的目标是不是book元素
        Aura.addEventListenerTo(document.getElementById("books"), "click", this.readBook.bind(this), ".book");

        document.querySelector("nav button").click()
    }
}

new Bookshelf().init();
