#pragma once

#include <string>
#include <vector>
#include <optional>
#include <cstdint>

namespace Data {
class DataCoordinateGroupRecord;
class DataCoordinateGroupRepository;
class DataMySqlConnection;
}

namespace Business {
class BusinessCoordinateGroup;
class BusinessCoordinateConverter;
class BusinessCoordinateGroupService;
}

namespace Presentation {
class PresentationCoordinateGroupForm;
class PresentationCoordinateGroupListView;
class PresentationCoordinateGroupController;
}

// =========================
// Data Tier (Persistence)
// =========================
namespace Data {

class DataCoordinateGroupRecord final {
public:
    int id{0};                       // auto-generated unique identifier
    std::string label;               // user-defined label
    std::int64_t timestampUtc{0};    // assigned timestamp (e.g., epoch seconds)

    double x{0.0};
    double y{0.0};
    double r{0.0};
    double theta{0.0};              // radians (convention defined by business layer)
};

class DataMySqlConnection final {
public:
    DataMySqlConnection() = default;
    ~DataMySqlConnection() = default;

    void configure(const std::string& host,
                   int port,
                   const std::string& database,
                   const std::string& user,
                   const std::string& password);

    void open();
    void close();
    bool isOpen() const;

private:
    std::string m_host;
    int m_port{3306};
    std::string m_database;
    std::string m_user;
    std::string m_password;
    bool m_open{false};
};

class DataCoordinateGroupRepository final {
public:
    explicit DataCoordinateGroupRepository(DataMySqlConnection& connection);
    ~DataCoordinateGroupRepository() = default;

    int insert(const DataCoordinateGroupRecord& record);                 // returns generated id
    bool update(const DataCoordinateGroupRecord& record);                // by id
    bool removeById(int id);

    std::optional<DataCoordinateGroupRecord> findById(int id) const;
    std::optional<DataCoordinateGroupRecord> findByLabel(const std::string& label) const;
    std::vector<DataCoordinateGroupRecord> findAll() const;

private:
    DataMySqlConnection& m_connection;
};

} // namespace Data

// =========================
// Business Tier (Domain/Logic)
// =========================
namespace Business {

class BusinessCoordinateGroup final {
public:
    int id{0};
    std::string label;
    std::int64_t timestampUtc{0};

    double x{0.0};
    double y{0.0};
    double r{0.0};
    double theta{0.0};

    bool hasId() const;
};

class BusinessCoordinateConverter final {
public:
    BusinessCoordinateConverter() = default;
    ~BusinessCoordinateConverter() = default;

    void cartesianToPolar(double x, double y, double& outR, double& outTheta) const;
    void polarToCartesian(double r, double theta, double& outX, double& outY) const;
};

class BusinessCoordinateGroupService final {
public:
    BusinessCoordinateGroupService(Data::DataCoordinateGroupRepository& repository,
                                   const BusinessCoordinateConverter& converter);
    ~BusinessCoordinateGroupService() = default;

    // Creation: input one type; service computes the other and persists
    BusinessCoordinateGroup createFromCartesian(const std::string& label, double x, double y);
    BusinessCoordinateGroup createFromPolar(const std::string& label, double r, double theta);

    // Retrieval
    std::optional<BusinessCoordinateGroup> getById(int id) const;
    std::optional<BusinessCoordinateGroup> getByLabel(const std::string& label) const;
    std::vector<BusinessCoordinateGroup> getAll() const;

    // Modification: update label and/or coordinates; service keeps both representations consistent
    bool updateFromCartesian(int id, const std::string& newLabel, double x, double y);
    bool updateFromPolar(int id, const std::string& newLabel, double r, double theta);

    // Deletion
    bool deleteById(int id);

private:
    Data::DataCoordinateGroupRepository& m_repository;
    const BusinessCoordinateConverter& m_converter;

private:
    BusinessCoordinateGroup mapToDomain(const Data::DataCoordinateGroupRecord& record) const;
    Data::DataCoordinateGroupRecord mapToRecord(const BusinessCoordinateGroup& group) const;
};

} // namespace Business

// =========================
// Presentation Tier (UI/Controller)
// =========================
namespace Presentation {

class PresentationCoordinateGroupForm final {
public:
    PresentationCoordinateGroupForm() = default;
    ~PresentationCoordinateGroupForm() = default;

    // Inputs (as entered by user)
    void setLabelInput(const std::string& label);
    void setCartesianInput(double x, double y);
    void setPolarInput(double r, double theta);

    // Mode selection: user provides either Cartesian or Polar
    void setUseCartesianInput(bool useCartesian);
    bool useCartesianInput() const;

    // Outputs (to display)
    void showMessage(const std::string& message);
    void showError(const std::string& error);
    void displayGroup(const Business::BusinessCoordinateGroup& group);

    // Read current inputs
    std::string labelInput() const;
    double xInput() const;
    double yInput() const;
    double rInput() const;
    double thetaInput() const;

private:
    std::string m_label;
    double m_x{0.0};
    double m_y{0.0};
    double m_r{0.0};
    double m_theta{0.0};
    bool m_useCartesian{true};
};

class PresentationCoordinateGroupListView final {
public:
    PresentationCoordinateGroupListView() = default;
    ~PresentationCoordinateGroupListView() = default;

    void displayAll(const std::vector<Business::BusinessCoordinateGroup>& groups);
    void displaySingle(const Business::BusinessCoordinateGroup& group);
    void showMessage(const std::string& message);
    void showError(const std::string& error);

    // Selection helpers (e.g., from a table/list)
    void setSelectedId(int id);
    int selectedId() const;

private:
    int m_selectedId{0};
};

class PresentationCoordinateGroupController final {
public:
    PresentationCoordinateGroupController(Business::BusinessCoordinateGroupService& service,
                                          PresentationCoordinateGroupForm& form,
                                          PresentationCoordinateGroupListView& listView);
    ~PresentationCoordinateGroupController() = default;

    // UI actions
    void onCreateRequested();
    void onViewAllRequested();
    void onSearchByLabelRequested(const std::string& label);
    void onLoadForEditRequested(int id);
    void onUpdateRequested(int id);
    void onDeleteRequested(int id);

private:
    Business::BusinessCoordinateGroupService& m_service;
    PresentationCoordinateGroupForm& m_form;
    PresentationCoordinateGroupListView& m_listView;
};

} // namespace Presentation