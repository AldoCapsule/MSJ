import SwiftUI

struct CategoriesView: View {
    @ObservedObject var viewModel: CategoriesViewModel
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showAddCategory = false

    var body: some View {
        NavigationStack {
            List {
                if !viewModel.customCategories.isEmpty {
                    Section("Custom") {
                        ForEach(viewModel.customCategories) { category in
                            CategoryRowView(category: category,
                                            onToggleHidden: { viewModel.toggleHidden(category) })
                        }
                        .onDelete { indexSet in
                            indexSet.map { viewModel.customCategories[$0] }.forEach { viewModel.deleteCategory($0) }
                        }
                    }
                }

                Section("System") {
                    ForEach(viewModel.systemCategories.filter { !$0.isHidden }) { category in
                        CategoryRowView(category: category,
                                        onToggleHidden: { viewModel.toggleHidden(category) })
                    }
                }

                if viewModel.systemCategories.contains(where: { $0.isHidden }) {
                    Section("Hidden") {
                        ForEach(viewModel.systemCategories.filter(\.isHidden)) { category in
                            CategoryRowView(category: category,
                                            onToggleHidden: { viewModel.toggleHidden(category) })
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Categories")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddCategory = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showAddCategory) {
                AddCategoryView { name, type, icon, color in
                    viewModel.addCategory(name: name, type: type, parentId: nil, icon: icon, color: color)
                }
            }
        }
        .onAppear {
            if let uid = authViewModel.currentUser?.uid { viewModel.load(uid: uid) }
        }
    }
}

struct CategoryRowView: View {
    let category: UserCategory
    let onToggleHidden: () -> Void

    var body: some View {
        HStack {
            ZStack {
                Circle().fill(category.swiftUIColor.opacity(0.15)).frame(width: 36, height: 36)
                Image(systemName: category.icon).foregroundColor(category.swiftUIColor).font(.callout)
            }
            Text(category.name).font(.subheadline)
                .foregroundColor(category.isHidden ? .secondary : .primary)
            Spacer()
            if category.isSystem {
                Text("System").font(.caption).foregroundColor(.secondary)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color(.systemGray5)).cornerRadius(6)
            }
            Menu {
                Button { onToggleHidden() } label: {
                    Label(category.isHidden ? "Show" : "Hide", systemImage: category.isHidden ? "eye" : "eye.slash")
                }
            } label: {
                Image(systemName: "ellipsis").foregroundColor(.secondary)
            }
        }
    }
}

struct AddCategoryView: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, CategoryType, String, String) -> Void

    @State private var name = ""
    @State private var type: CategoryType = .expense
    @State private var icon = "tag.fill"
    @State private var color = "#4DABF7"

    private let icons = ["tag.fill", "cart.fill", "car.fill", "house.fill", "heart.fill",
                         "fork.knife", "tv.fill", "airplane", "book.fill", "gift.fill",
                         "music.note", "gamecontroller.fill", "pawprint.fill", "leaf.fill"]
    private let colors = ["#FF6B6B", "#51CF66", "#339AF0", "#FCC419", "#845EF7",
                          "#FF922B", "#F06595", "#20C997", "#4DABF7", "#A9E34B",
                          "#CC5DE8", "#868E96", "#2F9E44", "#FA5252"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Category name", text: $name)
                    Picker("Type", selection: $type) {
                        Text("Expense").tag(CategoryType.expense)
                        Text("Income").tag(CategoryType.income)
                        Text("Transfer").tag(CategoryType.transfer)
                    }
                }
                Section("Icon") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 12) {
                        ForEach(icons, id: \.self) { i in
                            Image(systemName: i)
                                .font(.title3)
                                .foregroundColor(i == icon ? .white : .primary)
                                .frame(width: 40, height: 40)
                                .background(i == icon ? Color.accentColor : Color(.systemGray5))
                                .cornerRadius(8)
                                .onTapGesture { icon = i }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 12) {
                        ForEach(colors, id: \.self) { c in
                            Circle().fill(Color(hex: c)).frame(width: 36, height: 36)
                                .overlay(c == color ? Circle().stroke(Color.primary, lineWidth: 3) : nil)
                                .onTapGesture { color = c }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("New Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard !name.isEmpty else { return }
                        onSave(name, type, icon, color)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}
