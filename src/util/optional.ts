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
 * 可选值封装类
 * @author allurx
 */
export default class Optional<T> implements Iterable<T> {
    private readonly value: T | null | undefined;

    private constructor(value: T | null | undefined) {
        this.value = value;
    }

    public static of<T>(value: T | null | undefined): Optional<T> {
        if (value === null || value === undefined) {
            throw new Error("Optional.of() called with null or undefined");
        }
        return new Optional(value);
    }

    public static ofNullable<T>(value: T | null | undefined): Optional<T> {
        return new Optional(value);
    }

    public static empty<T = never>(): Optional<T> {
        return new Optional<T>(undefined);
    }

    public isPresent(): boolean {
        return this.value !== null && this.value !== undefined;
    }

    public ifPresent(consumer: (value: NonNullable<T>) => void): this {
        if (this.isPresent()) consumer(this.value as NonNullable<T>);
        return this;
    }

    public ifAbsent(action: () => void): this {
        if (!this.isPresent()) {
            action();
        }
        return this;
    }

    public ifPresentOrElse(consumer: (value: NonNullable<T>) => void, emptyAction: () => void): this {
        if (this.isPresent()) {
            consumer(this.value as NonNullable<T>);
        } else {
            emptyAction();
        }
        return this;
    }

    public map<U>(mapper: (value: NonNullable<T>) => U): Optional<U> {
        if (!this.isPresent()) return Optional.empty<U>();
        return Optional.ofNullable(mapper(this.value as NonNullable<T>));
    }

    public flatMap<U>(mapper: (value: NonNullable<T>) => Optional<U>): Optional<U> {
        if (!this.isPresent()) return Optional.empty<U>();
        return mapper(this.value as NonNullable<T>);
    }

    public filter(predicate: (value: NonNullable<T>) => boolean): Optional<T> {
        if (!this.isPresent()) return this;
        return predicate(this.value as NonNullable<T>) ? this : Optional.empty<T>();
    }

    public stream(): T[] {
        return this.isPresent() ? [this.value as T] : [];
    }

    public orElse(other: T): T {
        return this.isPresent() ? (this.value as T) : other;
    }

    public orElseGet(supplier: () => T): T {
        return this.isPresent() ? (this.value as T) : supplier();
    }

    public orElseThrow(errorSupplier: () => Error): T {
        if (!this.isPresent()) {
            throw errorSupplier();
        }
        return this.value as T;
    }

    public or(other: () => Optional<T>): Optional<T> {
        return this.isPresent() ? this : other();
    }

    public peek(consumer: (value: T) => void): this {
        if (this.isPresent()) {
            consumer(this.value as T);
        }
        return this;
    }

    public toString(): string {
        return this.isPresent() ? `Optional[${String(this.value)}]` : "Optional.empty";
    }

    public [Symbol.iterator](): Iterator<T> {
        return this.stream()[Symbol.iterator]();
    }

    public get(): T {
        if (!this.isPresent()) {
            throw new Error("Optional.get() called on empty Optional");
        }
        return this.value as T;
    }
}
