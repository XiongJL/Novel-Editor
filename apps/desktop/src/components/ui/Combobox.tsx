import { Fragment, useState } from 'react';
import { Combobox as HeadlessCombobox, Transition } from '@headlessui/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';

export interface ComboboxOption {
    id: string;
    name: string;
    [key: string]: any;
}

interface ComboboxProps<T extends ComboboxOption> {
    options: T[];
    value: string | null;
    onChange: (value: string) => void;
    onSearch?: (query: string) => void;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    theme: 'dark' | 'light';
    renderOption?: (option: T) => React.ReactNode;
    displayValue?: (option: T) => string;
    creatable?: boolean;
    className?: string;
    t?: (key: string, defaultValue?: string) => string;
}

export function Combobox<T extends ComboboxOption>({
    options,
    value,
    onChange,
    onSearch,
    placeholder = 'Search...',
    label,
    disabled = false,
    theme,
    renderOption,
    displayValue,
    className,
    creatable = false,
    t
}: ComboboxProps<T>) {
    const isDark = theme === 'dark';
    const [query, setQuery] = useState('');

    // If creatable is true, we allow values that don't exist in options
    const selectedOption = options.find(opt => opt.id === value) || (creatable && value ? { id: value, name: value } as T : null);

    const filteredOptions =
        query === ''
            ? options
            : options.filter((option) =>
                option.name
                    ? option.name
                        .toLowerCase()
                        .replace(/\s+/g, '')
                        .includes(query.toLowerCase().replace(/\s+/g, ''))
                    : false
            );

    // Initial Default Render
    const defaultRenderOption = (option: T) => (
        <span className={clsx("block truncate", selectedOption?.id === option.id ? 'font-medium' : 'font-normal')}>
            {option.name}
        </span>
    );

    const actualRenderOption = renderOption || defaultRenderOption;

    return (
        <div className={clsx("w-full", className)}>
            {label && (
                <label className={clsx("block text-xs font-medium mb-1", isDark ? "text-neutral-400" : "text-neutral-500")}>
                    {label}
                </label>
            )}
            <HeadlessCombobox
                value={selectedOption}
                onChange={(val: any) => {
                    // Handle 'Create' option which passes string directly or object
                    if (typeof val === 'string') {
                        onChange(val);
                    } else if (val?.id) {
                        onChange(val.id);
                    }
                }}
                disabled={disabled}
                nullable
            >
                {({ open }) => (
                    <div className="relative mt-1">
                        <div className={clsx(
                            "relative w-full cursor-default overflow-hidden rounded-lg text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-300 sm:text-sm",
                            isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-200"
                        )}>
                            <HeadlessCombobox.Input
                                className={clsx(
                                    "w-full border-none py-2 pl-3 pr-10 text-sm leading-5 focus:ring-0 outline-none bg-transparent",
                                    isDark ? "text-white placeholder-neutral-500" : "text-gray-900 placeholder-gray-400"
                                )}
                                displayValue={(option: T) => displayValue ? displayValue(option) : option?.name || ''}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    onSearch?.(event.target.value);
                                }}
                                placeholder={placeholder}
                            />
                            <HeadlessCombobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronDown
                                    className={clsx("h-4 w-4", isDark ? "text-neutral-400" : "text-gray-400")}
                                    aria-hidden="true"
                                />
                            </HeadlessCombobox.Button>

                            {/* Click to open overlay - only when closed */}
                            {!open && (
                                <HeadlessCombobox.Button className="absolute inset-0 w-full h-full opacity-0 cursor-default" />
                            )}
                        </div>
                        <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                            afterLeave={() => setQuery('')}
                        >
                            <HeadlessCombobox.Options
                                className={clsx(
                                    "absolute mt-1 max-h-60 w-full overflow-auto rounded-md py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50",
                                    isDark ? "bg-[#1a1a1a] border border-white/10" : "bg-white border border-gray-200"
                                )}
                            >
                                {creatable && query.length > 0 && !filteredOptions.some(o => o.name.toLowerCase() === query.toLowerCase()) && (
                                    <HeadlessCombobox.Option
                                        value={{ id: query, name: query } as any}
                                        className={({ active }) =>
                                            clsx(
                                                "relative cursor-default select-none py-2 pl-10 pr-4 transition-colors",
                                                active
                                                    ? (isDark ? "bg-indigo-600/20 text-indigo-300" : "bg-indigo-50 text-indigo-900")
                                                    : (isDark ? "text-neutral-300" : "text-gray-900")
                                            )
                                        }
                                    >
                                        <span className="block truncate">{t?.('common.create', 'Create') || 'Create'} "{query}"</span>
                                        <span className={clsx("absolute inset-y-0 left-0 flex items-center pl-3", isDark ? "text-indigo-400" : "text-indigo-600")}>
                                            <Search className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                    </HeadlessCombobox.Option>
                                )}

                                {filteredOptions.length === 0 && query !== '' && !creatable ? (
                                    <div className={clsx("relative cursor-default select-none px-4 py-2", isDark ? "text-neutral-500" : "text-gray-700")}>
                                        Nothing found.
                                    </div>
                                ) : (
                                    filteredOptions.map((option) => (
                                        <HeadlessCombobox.Option
                                            key={option.id}
                                            className={({ active }) =>
                                                clsx(
                                                    "relative cursor-default select-none py-2 pl-10 pr-4 transition-colors",
                                                    active
                                                        ? (isDark ? "bg-indigo-600/20 text-indigo-300" : "bg-indigo-50 text-indigo-900")
                                                        : (isDark ? "text-neutral-300" : "text-gray-900")
                                                )
                                            }
                                            value={option}
                                        >
                                            {({ selected, active }) => (
                                                <>
                                                    <span className={clsx("block truncate", selected ? 'font-medium' : 'font-normal')}>
                                                        {actualRenderOption(option)}
                                                    </span>
                                                    {selected ? (
                                                        <span
                                                            className={clsx(
                                                                "absolute inset-y-0 left-0 flex items-center pl-3",
                                                                active
                                                                    ? (isDark ? "text-indigo-300" : "text-indigo-600")
                                                                    : (isDark ? "text-indigo-400" : "text-indigo-600")
                                                            )}
                                                        >
                                                            <Check className="h-4 w-4" aria-hidden="true" />
                                                        </span>
                                                    ) : null}
                                                </>
                                            )}
                                        </HeadlessCombobox.Option>
                                    ))
                                )}
                            </HeadlessCombobox.Options>
                        </Transition>
                    </div>
                )}
            </HeadlessCombobox>
        </div>
    );
}
