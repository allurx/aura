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

/**
 * 书架
 * @author allurx
 */
class Bookshelf {

    /** 
     * 书籍分类列表
     * @type {Array<{id: number, name: string}>}  
     */
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

    // 数据库存储
    bookStore = Aura.databaseProperties.stores.book;
    chapterStore = Aura.databaseProperties.stores.chapter;
    tableOfContentsStore = Aura.databaseProperties.stores.tableOfContents;
    readingProgressStore = Aura.databaseProperties.stores.readingProgress;

    /** 
     * 当前书籍分类id
     * @type {number} 
     */
    currentBookGenreId = 1;

    /** 
     * 遮罩层
     * @type {Overlay} 
     */
    overlay = new Overlay();

    /**
     * 初始化
     */
    init() {
        this.initNav();
        this.bindEvent();
        this.switchCurrentGenre();
    }

    /**
     * 初始化导航栏
     */
    initNav() {
        const navElement = document.querySelector("nav");
        this.bookGenres.forEach(bookGenre => {
            const button = document.createElement("button");
            button.dataset.id = bookGenre.id;
            button.textContent = bookGenre.name;
            navElement.appendChild(button);
        })
    }

    /**
     * 切换书籍分类
     * @param {HTMLElement} button - 书籍分类按钮
     */
    switchGenre(button) {
        document.querySelector("nav button.active")?.classList.remove("active");
        button.classList.add("active");
        this.currentBookGenreId = Number(button.dataset.id);

        // 删除原先书籍分类下的页面元素
        document.querySelectorAll(".book").forEach(element => element.remove());

        // 找到当前书籍类型下的文件,并将其添加的页面元素中
        Aura.database.getAllByIndex(this.bookStore.name, this.bookStore.indexes.genreId.name, this.currentBookGenreId)
            .then(books => books.forEach(book => this.createBookElement(new Book(book))));
    }

    /**
     * 切换到当前书籍分类
     */
    switchCurrentGenre() {
        this.switchGenre(document.querySelector(`nav button[data-id="${this.currentBookGenreId}"]`));
    }

    /**
     * 添加书籍
     * @param {HTMLInputElement} bookInputElement - 书籍文件输入框
     */
    async addBook(bookInputElement) {
        try {
            this.overlay.show();
            // 每本书在自己的独立事务中,允许部分事务成功
            await Promise.all(Array.from(bookInputElement.files)
                .map(async file => {

                    if (file.type !== "text/plain") {
                        alert(`${file.name}不是文本文件`);
                        return;
                    }

                    // 创建书籍
                    const book = await Book.create(file, this.currentBookGenreId);

                    // 解析章节
                    const chapters = await Chapter.parse(file);

                    // 生成目录
                    const tableOfContents = new TableOfContents({ contents: chapters });

                    // 创建阅读进度
                    const readingProgress = new ReadingProgress({ chapterIndex: 1, lineIndex: 1, scrollTop: 0 });

                    // 将书籍和章节存入数据库
                    await Aura.database.transaction(
                        [this.bookStore.name, this.chapterStore.name, this.tableOfContentsStore.name, this.readingProgressStore.name],
                        Database.READ_WRITE,
                        async (dbop) => {

                            // 保存书籍
                            const bookId = await dbop.add(this.bookStore.name, book);

                            // 批量保存章节
                            chapters.forEach(chapter => chapter.bookId = bookId);
                            await dbop.putAll(this.chapterStore.name, chapters);

                            // 保存目录
                            tableOfContents.bookId = bookId;
                            await dbop.add(this.tableOfContentsStore.name, tableOfContents);

                            // 保存阅读进度
                            readingProgress.bookId = bookId;
                            await dbop.put(this.readingProgressStore.name, readingProgress);

                            // 创建书籍元素
                            this.createBookElement(book);
                        });
                }));
        } finally {
            // 重置,支持重复上传同一文件
            bookInputElement.value = "";
            this.overlay.hide();
        }
    }

    /**
     * 创建书籍元素
     * @param {Book} book - 书籍实例
     */
    createBookElement(book) {
        document.getElementById("books").insertAdjacentHTML("beforeend", book.template());
    }

    /**
     * 阅读书籍
     * @param {HTMLElement} bookBodyElement - 书籍元素
     */
    readBook(bookBodyElement) {
        const bookId = Number(bookBodyElement.parentElement.dataset.id);
        window.location.href = "./page/reader.html";
        window.sessionStorage.setItem("bookId", bookId);
    }

    /**
     * 删除书籍
     * @param {HTMLElement} deleteBookElement - 删除书籍按钮元素
     */
    async deleteBook(deleteBookElement) {
        if (confirm("确定要删除这本书吗？")) {
            const bookElement = deleteBookElement.closest(".book");
            const bookId = Number(bookElement.dataset.id);
            await Aura.database.transaction(
                [this.bookStore.name, this.chapterStore.name, this.tableOfContentsStore.name, this.readingProgressStore.name],
                Database.READ_WRITE,
                async (dbop) => {
                    this.overlay.show();
                    await dbop.deleteByKey(this.bookStore.name, bookId);
                    await dbop.deleteAllByIndex(this.chapterStore.name, this.chapterStore.indexes.bookId.name, bookId);
                    await dbop.deleteByKey(this.tableOfContentsStore.name, bookId);
                    await dbop.deleteByKey(this.readingProgressStore.name, bookId);
                })
                .then(() => bookElement.remove())
                .finally(() => this.overlay.hide());
        }
    }

    /**
     * 清空书架
     */
    async clearBookshelf() {
        if (confirm("确定要清空书架中的所有书籍吗?")) {
            await Aura.database.transaction(
                [this.bookStore.name, this.chapterStore.name, this.tableOfContentsStore.name, this.readingProgressStore.name],
                Database.READ_WRITE,
                async (dbop) => {
                    this.overlay.show();
                    dbop.deleteAll(this.bookStore.name);
                    dbop.deleteAll(this.tableOfContentsStore.name);
                    dbop.deleteAll(this.readingProgressStore.name);
                    dbop.deleteAll(this.chapterStore.name);
                })
                .then(() => this.switchCurrentGenre())
                .finally(() => this.overlay.hide());
        }
    }

    /**
     * 绑定事件
     */
    bindEvent() {
        EventBinderUtil.bind("nav button", "click", this.switchGenre.bind(this));
        EventBinderUtil.bind("#book-input", "change", this.addBook.bind(this));
        EventBinderUtil.bind("#clear-bookshelf", "click", this.clearBookshelf.bind(this));
        EventBinderUtil.bind("#header-title", "click", () => document.querySelector("nav").classList.toggle("flag"));

        // book元素是动态生成的,需要通过事件冒泡判断来绑定的事件
        EventBinderUtil.delegate("#books", ".book-body", "click", this.readBook.bind(this));
        EventBinderUtil.delegate("#books", ".delete-book", "click", this.deleteBook.bind(this));
    }
}

// 初始化书架
new Bookshelf().init();
