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
import Book from "./model/book.js";
import Chapter from "./model/chapter.js";
import Database from "./database/database.js";
import Overlay from "./component/overlay.js";
import EventBinderUtil from "./util/eventBinderUtil.js";
import ReadingProgress from "./model/readingProgress.js";
import TableOfContents from "./model/tableOfContents.js";

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
    currentBookGenreId = 1;

    // 遮罩层
    overlay = new Overlay();

    init() {
        this.initNav();
        this.bindEvent();
        this.switchCurrentGenre();
    }

    // 初始化左侧导航栏
    initNav() {
        const navElement = document.querySelector("nav");
        this.bookGenres.forEach(bookGenre => {
            const button = document.createElement("button");
            button.dataset.id = bookGenre.id;
            button.textContent = bookGenre.name;
            navElement.appendChild(button);
        })
    }

    // 书籍分类切换
    switchGenre(button) {
        document.querySelector("nav button.active")?.classList.remove("active");
        button.classList.add("active");
        this.currentBookGenreId = Number(button.dataset.id);

        // 删除原先书籍分类下的页面元素
        document.querySelectorAll(".book").forEach(element => element.remove());

        // 找到当前书籍类型下的文件，并将其添加的页面元素中
        Aura.database.getAllByIndex(Aura.databaseProperties.stores.book.name, Aura.databaseProperties.stores.book.indexes.genreId.name, this.currentBookGenreId)
            .then(books => books.forEach(book => this.createBookElement(new Book(book.id, book.genreId, book.hash, book.fileName, book.title))));
    }

    // 切换到当前书籍分类
    switchCurrentGenre() {
        document.querySelector(`nav button[data-id="${this.currentBookGenreId}"]`).click();
    }

    // 添加书籍
    async addBook(bookInput) {
        try {
            this.overlay.show();
            // 每本书在自己的独立事务中，允许部分事务成功
            await Promise.all(Array.from(bookInput.files)
                .map(async file => {

                    // 获取数据库表名
                    const bookStoreName = Aura.databaseProperties.stores.book.name;
                    const chapterStoreName = Aura.databaseProperties.stores.chapter.name;
                    const tableOfContentsStoreName = Aura.databaseProperties.stores.tableOfContents.name;
                    const readingProgressStoreName = Aura.databaseProperties.stores.readingProgress.name;

                    // 创建书籍
                    const book = await Book.create(file, this.currentBookGenreId);

                    // 解析章节
                    const chapters = await Chapter.parse(file, book.id);

                    // 生成目录
                    const tableOfContents = new TableOfContents(book.id, chapters.map(chapter => new TableOfContents.content(chapter.id, chapter.title)));

                    // 创建阅读进度
                    const readingProgress = new ReadingProgress(book.id, 0, 0, 0);

                    // 将书籍和章节存入数据库
                    await Aura.database.transaction(
                        [bookStoreName, chapterStoreName, tableOfContentsStoreName, readingProgressStoreName],
                        Database.READ_WRITE,
                        async (dbop) => {

                            // 保存书籍
                            await dbop.add(bookStoreName, book);

                            // 批量保存章节
                            await dbop.putAll(chapterStoreName, chapters);

                            // 保存目录
                            await dbop.add(tableOfContentsStoreName, tableOfContents);

                            // 保存阅读进度
                            await dbop.put(readingProgressStoreName, readingProgress);

                            // 创建书籍元素
                            this.createBookElement(book);
                        });
                }));
        } finally {
            // 重置，支持重复上传同一文件
            bookInput.value = "";
            this.overlay.hide();
        }
    }

    // 创建书籍元素
    createBookElement(book) {
        document.getElementById("books").insertAdjacentHTML("beforeend", book.template());
    }

    // 阅读书籍
    readBook(bookElement) {
        const bookId = bookElement.parentElement.id;
        window.location.href = "./page/reader.html";
        //const win = window.open("./page/reader.html");
        window.sessionStorage.setItem("bookId", bookId);
    }

    // 删除书籍
    async deleteBook(deleteBookElement) {
        if (confirm("确定要删除这本书吗？")) {
            const bookElement = deleteBookElement.closest(".book");
            const bookId = bookElement.id;
            const bookStoreName = Aura.databaseProperties.stores.book.name;
            const chapterStoreName = Aura.databaseProperties.stores.chapter.name;
            const chapterIndexName = Aura.databaseProperties.stores.chapter.indexes.bookId.name;
            const tableOfContentsStoreName = Aura.databaseProperties.stores.tableOfContents.name;
            const readingProgressStoreName = Aura.databaseProperties.stores.readingProgress.name;
            await Aura.database.transaction(
                [bookStoreName, chapterStoreName, tableOfContentsStoreName, readingProgressStoreName],
                Database.READ_WRITE,
                async (dbop) => {

                    this.overlay.show();

                    await dbop.deleteByKey(bookStoreName, bookId);
                    await dbop.deleteAllByIndex(chapterStoreName, chapterIndexName, bookId);
                    await dbop.deleteByKey(tableOfContentsStoreName, bookId);
                    await dbop.deleteByKey(readingProgressStoreName, bookId);
                }
            ).then(() => {
                bookElement.remove();
            }).finally(() => {
                this.overlay.hide();
            });
        }
    }

    // 清空书架
    async clearBookshelf() {
        if (confirm("确定要清空书架中的所有书籍吗？")) {

            const bookStoreName = Aura.databaseProperties.stores.book.name;
            const chapterStoreName = Aura.databaseProperties.stores.chapter.name;
            const chapterIndexName = Aura.databaseProperties.stores.chapter.indexes.bookId.name;
            const tableOfContentsStoreName = Aura.databaseProperties.stores.tableOfContents.name;
            const readingProgressStoreName = Aura.databaseProperties.stores.readingProgress.name;

            // 在事务外部获取所有书籍的列表
            const books = await Aura.database.getAll(bookStoreName);
            if (books.length === 0) return;

            // 将所有书的所有操作合并到一个事务中，要么都成功，要么都失败
            await Aura.database.transaction(
                [bookStoreName, chapterStoreName, tableOfContentsStoreName, readingProgressStoreName],
                Database.READ_WRITE,
                async (dbop) => {

                    this.overlay.show();

                    // 每本书有三个数据库操作，合并所有操作
                    const deletePromises = books.flatMap(book => [
                        dbop.deleteByKey(bookStoreName, book.id),
                        dbop.deleteByKey(tableOfContentsStoreName, book.id),
                        dbop.deleteByKey(readingProgressStoreName, book.id),
                        dbop.deleteAllByIndex(chapterStoreName, chapterIndexName, book.id)
                    ]);

                    // 等待所有删除操作完成
                    await Promise.all(deletePromises);

                }).then(() => {
                    console.log("书架已清空！");
                    this.switchCurrentGenre();
                }).finally(() => {
                    this.overlay.hide();
                });

        }
    }

    // 绑定事件
    bindEvent() {
        EventBinderUtil.bind("nav button", "click", this.switchGenre.bind(this));
        EventBinderUtil.bind("#book-input", "change", this.addBook.bind(this));
        EventBinderUtil.bind("#clear-bookshelf", "click", this.clearBookshelf.bind(this));
        EventBinderUtil.bind("#header-title", "click", () => document.querySelector("nav").classList.toggle("flag"));

        // book元素是动态生成的，需要通过事件冒泡判断来绑定的事件
        EventBinderUtil.delegate("#books", ".book-body", "click", this.readBook.bind(this));
        EventBinderUtil.delegate("#books", ".delete-book", "click", this.deleteBook.bind(this));
    }
}

new Bookshelf().init();
